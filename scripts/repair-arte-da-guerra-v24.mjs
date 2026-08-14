import { readFile, writeFile } from "node:fs/promises";

const read = async (path) => (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
const replaceIfNeeded = (source, before, after, label) => {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`v24 patch point not found: ${label}`);
  return source.replace(before, after);
};

{
  const path = "app/rules-engine/effects.mjs";
  let source = await read(path);
  source = replaceIfNeeded(
    source,
    'openRepositionWindow(state, effect, context) { state.pendingReposition = { owners: [0, 1], confirmed: [], moveAttachments: true, sourceId: context.sourceId }; },',
    'openRepositionWindow(state, effect, context) { const first=state.active; state.pendingReposition = { owners: [first, 1-first], confirmed: [], activeOwner:first, moveAttachments:true, sourceId:context.sourceId, deadline:Date.now()+30000 }; },',
    "openRepositionWindow sequencing"
  );
  await writeFile(path, source);
}

{
  const path = "app/rules-engine/engine.mjs";
  let source = await read(path);
  const oldReposition = `      } else if (item.command.type === "reposition") {\n        const pending = state.pendingReposition; if (!pending || !pending.owners.includes(item.command.owner) || pending.confirmed.includes(item.command.owner)) throw new RulesViolation("reposition-unavailable");\n        const entry = state.players[item.command.owner]; const moves = item.command.moves || []; const slots = moves.map((move) => move.slot);\n        if (slots.some((slot) => !Number.isInteger(slot) || slot < 0 || slot > 4) || new Set(slots).size !== slots.length) throw new RulesViolation("invalid-reposition");\n        for (const move of moves) { const creature = entry.board.find((card) => card.uid === move.sourceId); if (!creature) throw new RulesViolation("invalid-reposition-card"); creature.slot = move.slot; for (const artifact of entry.support.filter((card) => card.attachedTo === creature.uid)) artifact.slot = move.slot; }\n      } else if (item.command.type === "confirmReposition") {\n        const pending = state.pendingReposition; if (!pending || !pending.owners.includes(item.command.owner)) throw new RulesViolation("reposition-unavailable");\n        if (!pending.confirmed.includes(item.command.owner)) pending.confirmed.push(item.command.owner); if (pending.confirmed.length === pending.owners.length) state.pendingReposition = null;`;
  const newReposition = `      } else if (item.command.type === "reposition") {\n        const pending = state.pendingReposition;\n        if (!pending || pending.activeOwner !== item.command.owner || pending.confirmed.includes(item.command.owner)) throw new RulesViolation("reposition-unavailable");\n        const entry = state.players[item.command.owner];\n        for (const move of item.command.moves || []) {\n          const destination = move.slot;\n          if (!Number.isInteger(destination) || destination < 0 || destination > 4) throw new RulesViolation("invalid-reposition");\n          const creature = entry.board.find((card) => card.uid === move.sourceId);\n          if (!creature) throw new RulesViolation("invalid-reposition-card");\n          const origin = creature.slot;\n          if (origin === destination) continue;\n          const occupant = entry.board.find((card) => card.uid !== creature.uid && card.slot === destination);\n          const movingArtifact = entry.support.find((card) => card.attachedTo === creature.uid);\n          const occupantArtifact = occupant ? entry.support.find((card) => card.attachedTo === occupant.uid) : null;\n          const originSupport = entry.support.find((card) => card.slot === origin);\n          const destinationSupport = entry.support.find((card) => card.slot === destination);\n          if (occupant) occupant.slot = origin;\n          creature.slot = destination;\n          if (movingArtifact || occupantArtifact) {\n            if (originSupport) originSupport.slot = destination;\n            if (destinationSupport) destinationSupport.slot = origin;\n          }\n        }\n      } else if (item.command.type === "confirmReposition") {\n        const pending = state.pendingReposition;\n        if (!pending || pending.activeOwner !== item.command.owner || pending.confirmed.includes(item.command.owner)) throw new RulesViolation("reposition-unavailable");\n        pending.confirmed.push(item.command.owner);\n        const next = pending.owners.find((owner) => !pending.confirmed.includes(owner));\n        if (next == null) state.pendingReposition = null;\n        else { pending.activeOwner = next; pending.deadline = Date.now() + 30000; }`;
  source = replaceIfNeeded(source, oldReposition, newReposition, "authoritative reposition commands");
  await writeFile(path, source);
}

{
  const path = "app/page.tsx";
  let source = await read(path);

  source = replaceIfNeeded(
    source,
    'pendingReposition?:{owners:Array<0|1>;confirmed:Array<0|1>;moveAttachments:boolean;sourceId?:string}|null;',
    'pendingReposition?:{owners:Array<0|1>;confirmed:Array<0|1>;activeOwner?:0|1;moveAttachments:boolean;sourceId?:string;deadline?:number}|null;',
    "pendingReposition type"
  );
  source = replaceIfNeeded(
    source,
    'const [repositionDraft,setRepositionDraft]=useState<Record<string,number>>({});',
    'const [repositionSeconds,setRepositionSeconds]=useState(30);const aiRepositionHandledRef=useRef<string>("");',
    "reposition client state"
  );
  source = replaceIfNeeded(
    source,
    'mirrored.pendingReposition={...structuredClone(source.pendingReposition),owners:source.pendingReposition.owners.map(owner=>owner===0?1:0),confirmed:source.pendingReposition.confirmed.map(owner=>owner===0?1:0)};',
    'mirrored.pendingReposition={...structuredClone(source.pendingReposition),owners:source.pendingReposition.owners.map(owner=>owner===0?1:0),confirmed:source.pendingReposition.confirmed.map(owner=>owner===0?1:0),activeOwner:typeof source.pendingReposition.activeOwner==="number"?(source.pendingReposition.activeOwner===0?1:0):source.pendingReposition.activeOwner};',
    "online reposition mirroring"
  );

  source = replaceIfNeeded(
    source,
    'onSupportTarget,activationEnabled=false,combatActive=false}:{player:Player;',
    'onSupportTarget,activationEnabled=false,combatActive=false,repositionActive=false,onRepositionDrop}:{player:Player;',
    "BattlefieldRows argument list"
  );
  source = replaceIfNeeded(
    source,
    'onSupportTarget?:(uid:string)=>void;activationEnabled?:boolean;combatActive?:boolean}){',
    'onSupportTarget?:(uid:string)=>void;activationEnabled?:boolean;combatActive?:boolean;repositionActive?:boolean;onRepositionDrop?:(uid:string,slot:number)=>void}){',
    "BattlefieldRows prop type"
  );
  source = replaceIfNeeded(
    source,
    'return <div className={`paired-field ${enemy?"enemy-field":"player-field"}`}>',
    'return <div className={`paired-field ${enemy?"enemy-field":"player-field"} ${repositionActive?"arte-reposition-active":""}`}>',
    "BattlefieldRows reposition class"
  );
  source = replaceIfNeeded(source,'canCreature=drop&&dragged?.type==="Criatura",','canCreature=repositionActive||(drop&&dragged?.type==="Criatura"),',"creature drop availability");
  source = replaceIfNeeded(source,'canSupport=drop&&!support&&isAuxiliaryCard&&(dragged!.type!=="Artefato"||!!creature),','canSupport=!repositionActive&&drop&&!support&&isAuxiliaryCard&&(dragged!.type!=="Artefato"||!!creature),',"support lock during reposition");
  source = replaceIfNeeded(
    source,
    'onDrop={e=>{e.preventDefault();e.currentTarget.classList.remove("drag-over");if(canCreature)onCreatureDrop?.(dragged!.index,slot)}}>{creature?',
    'onDrop={e=>{e.preventDefault();e.currentTarget.classList.remove("drag-over");if(repositionActive){const uid=e.dataTransfer.getData("reposition-source");if(uid)onRepositionDrop?.(uid,slot)}else if(canCreature)onCreatureDrop?.(dragged!.index,slot)}}>{creature?',
    "creature reposition drop handler"
  );
  source = replaceIfNeeded(
    source,
    'targetClass={`${creatureRuleTarget?(enemy?"target-enemy":"target-ally"):allyTarget&&(!targetableCreatureIds||targetableCreatureIds.includes(creature.uid))?"target-ally":enemyTarget?"target-enemy":""} ${canAttackNow?"combat-attack-ready":""}`.trim()} onClick=',
    'targetClass={`${creatureRuleTarget?(enemy?"target-enemy":"target-ally"):allyTarget&&(!targetableCreatureIds||targetableCreatureIds.includes(creature.uid))?"target-ally":enemyTarget?"target-enemy":""} ${canAttackNow?"combat-attack-ready":""}`.trim()} draggable={repositionActive&&!enemy} onDragStart={repositionActive&&!enemy?e=>{centerDragPreview(e);e.dataTransfer.setData("reposition-source",creature.uid);e.dataTransfer.effectAllowed="move"}:undefined} onClick=',
    "creature reposition drag source"
  );
  source = replaceIfNeeded(
    source,
    'onClick={creatureRuleTarget&&onRuleTarget?()=>onRuleTarget(creature.uid):onCreature?()=>onCreature(creature.uid):undefined} onActivate={onActivateCreature?()=>onActivateCreature(creature.uid):undefined} activationDisabled={!activationEnabled||!canActivateUnit(player,creature)}',
    'onClick={repositionActive?undefined:creatureRuleTarget&&onRuleTarget?()=>onRuleTarget(creature.uid):onCreature?()=>onCreature(creature.uid):undefined} onActivate={repositionActive?undefined:onActivateCreature?()=>onActivateCreature(creature.uid):undefined} activationDisabled={repositionActive||!activationEnabled||!canActivateUnit(player,creature)}',
    "creature interactions lock"
  );
  source = replaceIfNeeded(
    source,
    'onClick={supportRuleTarget&&onRuleTarget?()=>onRuleTarget(support.uid):onSupportTarget?()=>onSupportTarget(support.uid):undefined} onActivate={onActivateSupport?()=>onActivateSupport(support.uid):undefined} activationDisabled={!activationEnabled||!canActivateUnit(player,support)}',
    'onClick={repositionActive?undefined:supportRuleTarget&&onRuleTarget?()=>onRuleTarget(support.uid):onSupportTarget?()=>onSupportTarget(support.uid):undefined} onActivate={repositionActive?undefined:onActivateSupport?()=>onActivateSupport(support.uid):undefined} activationDisabled={repositionActive||!activationEnabled||!canActivateUnit(player,support)}',
    "support interactions lock"
  );

  const oldClient = ` const repositionForLocal=!!game?.pendingReposition?.owners.includes(0)&&!game.pendingReposition.confirmed.includes(0);\n const moveForArteDaGuerra=(sourceId:string,slot:number)=>{if(!repositionForLocal||!game)return;setRepositionDraft(current=>{const draft=Object.keys(current).length?{...current}:Object.fromEntries(game.players[0].board.map(card=>[card.uid,card.slot]));const previous=draft[sourceId]??game.players[0].board.find(card=>card.uid===sourceId)?.slot;const occupant=Object.entries(draft).find(([uid,value])=>uid!==sourceId&&value===slot)?.[0];draft[sourceId]=slot;if(occupant&&previous!==undefined)draft[occupant]=previous;return draft})};\n const confirmArteDaGuerra=()=>{if(!repositionForLocal||!game)return;const moves=game.players[0].board.map(card=>({sourceId:card.uid,slot:repositionDraft[card.uid]??card.slot}));void runRulesCommand({type:"reposition",moves},0).then(accepted=>{if(accepted){setRepositionDraft({});void runRulesCommand({type:"confirmReposition"},0)}})};`;
  const newClient = ` const repositionForLocal=!!game?.pendingReposition&&game.pendingReposition.activeOwner===0&&!game.pendingReposition.confirmed.includes(0);\n const moveForArteDaGuerra=(sourceId:string,slot:number)=>{if(!repositionForLocal||!game)return;void runRulesCommand({type:"reposition",moves:[{sourceId,slot}]},0)};\n const confirmArteDaGuerra=()=>{if(!repositionForLocal)return;void runRulesCommand({type:"confirmReposition"},0)};\n useEffect(()=>{const pending=game?.pendingReposition;if(!pending?.deadline){setRepositionSeconds(30);return}const tick=()=>setRepositionSeconds(Math.max(0,Math.ceil((pending.deadline-Date.now())/1000)));tick();const timer=window.setInterval(tick,250);return()=>window.clearInterval(timer)},[game?.pendingReposition?.deadline,game?.pendingReposition?.activeOwner]);\n useEffect(()=>{if(!repositionForLocal||repositionSeconds>0)return;confirmArteDaGuerra()},[repositionForLocal,repositionSeconds]);\n useEffect(()=>{const pending=game?.pendingReposition;if(mode!=="bot"||!game||pending?.activeOwner!==1||pending.confirmed.includes(1))return;const key=String(game.round)+":"+String(pending.deadline||0);if(aiRepositionHandledRef.current===key)return;aiRepositionHandledRef.current=key;const entry=game.players[1],isSupport=(card:Unit)=>!card.suffocated&&(/\\bsuporte\\b/i.test(card.text||"")||(card.tags||[]).some(tag=>/\\bsuporte\\b/i.test(String(tag)))),strength=(card:Unit)=>currentAtk(card,entry),moves:Array<{sourceId:string;slot:number}>=[],supportCreature=entry.board.find(isSupport);if(supportCreature){moves.push({sourceId:supportCreature.uid,slot:2});const others=entry.board.filter(card=>card.uid!==supportCreature.uid).sort((a,b)=>strength(b)-strength(a)),slots=[1,3,0,4];others.forEach((card,index)=>moves.push({sourceId:card.uid,slot:slots[index]??card.slot}))}else{const ordered=[...entry.board].sort((a,b)=>strength(b)-strength(a)),slots=[0,4,1,3,2];ordered.forEach((card,index)=>moves.push({sourceId:card.uid,slot:slots[index]??card.slot}))}const timer=window.setTimeout(()=>{void runRulesCommand({type:"reposition",moves},1).then(ok=>{if(ok)void runRulesCommand({type:"confirmReposition"},1)})},420);return()=>window.clearTimeout(timer)},[mode,game?.pendingReposition?.activeOwner,game?.pendingReposition?.deadline]);`;
  source = replaceIfNeeded(source, oldClient, newClient, "client Arte da Guerra flow");

  const oldModal = '{repositionForLocal&&game&&<div className="engine-decision-backdrop"><section className="engine-decision-panel"><small>ARTE DA GUERRA</small><h2>Reposicione suas criaturas</h2><p>Escolha uma posição para cada criatura. Ao trocar duas posições, os Artefatos vinculados acompanham suas criaturas.</p><div>{game.players[0].board.map(card=><div className="reposition-row" key={card.uid}><span>{card.name}</span>{Array.from({length:5},(_,slot)=><button key={slot} className={(repositionDraft[card.uid]??card.slot)===slot?"selected":""} onClick={()=>moveForArteDaGuerra(card.uid,slot)}>{slot+1}</button>)}</div>)}<button className="gold" onClick={confirmArteDaGuerra}>Confirmar posições</button></div></section></div>}';
  const newModal = '{repositionForLocal&&<div className="arte-da-guerra-decision"><span><b>ARTE DA GUERRA</b> · Arraste suas criaturas entre os espaços</span><strong>{repositionSeconds}s</strong><button onClick={confirmArteDaGuerra}>CONFIRMAR POSIÇÕES</button></div>}';
  source = replaceIfNeeded(source, oldModal, newModal, "remove reposition modal");
  source = replaceIfNeeded(source,'{!!game?.pendingReposition&&!repositionForLocal&&<div className="engine-decision-wait">O oponente está reposicionando as criaturas…</div>}','{!!game?.pendingReposition&&!repositionForLocal&&<div className="engine-decision-wait">O oponente está reorganizando o campo com Arte da Guerra…</div>}',"reposition wait label");
  source = replaceIfNeeded(source,'<BattlefieldRows player={me} ruleTargetIds=','<BattlefieldRows player={me} repositionActive={repositionForLocal} onRepositionDrop={moveForArteDaGuerra} ruleTargetIds=',"local BattlefieldRows reposition props");

  await writeFile(path, source);
}

{
  const cssPath = "app/arte-da-guerra-v24.css";
  const css = `.arte-da-guerra-decision{position:fixed;left:50%;bottom:clamp(82px,10vh,128px);transform:translateX(-50%);z-index:125;display:flex;align-items:center;gap:14px;min-width:min(560px,92vw);padding:10px 14px;border:1px solid #d9ad5588;border-radius:12px;background:#090f1aee;box-shadow:0 12px 34px #0009;backdrop-filter:blur(8px);font:700 clamp(10px,.75vw,13px)/1.2 Arial,sans-serif;letter-spacing:.05em}.arte-da-guerra-decision span{flex:1;color:#e9dfca}.arte-da-guerra-decision span b{color:#d9ad55}.arte-da-guerra-decision strong{font-size:clamp(16px,1.3vw,22px);color:#f3c86f;min-width:38px;text-align:center}.arte-da-guerra-decision button{border:1px solid #d9ad5588;background:linear-gradient(135deg,#a86d20,#e2bc67);color:#17110a;border-radius:8px;padding:8px 12px;font-weight:900}.arte-reposition-active .creature-slot{outline:1px dashed #e5b95d66;outline-offset:-3px}.arte-reposition-active .creature-slot.can-drop{cursor:grab}.arte-reposition-active .creature-slot.drag-over{outline:2px solid #f1c96e;box-shadow:inset 0 0 22px #d9ad5533,0 0 16px #d9ad5533}.arte-reposition-active .auxiliary-slot{filter:saturate(.85)}@media(max-width:720px){.arte-da-guerra-decision{gap:8px;padding:8px 10px}.arte-da-guerra-decision span{max-width:45vw}.arte-da-guerra-decision button{padding:7px 9px}}\n`;
  await writeFile(cssPath, css);
  const globalsPath = "app/globals.css";
  let globals = await read(globalsPath);
  if (!globals.includes('@import "./arte-da-guerra-v24.css";')) globals += '\n@import "./arte-da-guerra-v24.css";\n';
  await writeFile(globalsPath, globals);
}

console.log("v24 applied: Arte da Guerra uses direct creature drag, sequential 30s turns, linked-artifact swaps and AI positioning");
