import { readFile, writeFile } from "node:fs/promises";

const normalize = (value) => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const read = async (path) => normalize(await readFile(path, "utf8"));
const write = (path, value) => writeFile(path, normalize(value));

const replaceIfPresent = (source, before, after) => source.includes(before) ? source.replace(before, after) : source;

// ---------------------------------------------------------------------------
// Preserve the UI values manually tuned in commit 8465ba2 and load v5 last.
// ---------------------------------------------------------------------------
{
  const path = "app/lab.css";
  let source = await read(path);
  if (!source.includes('ui-gameplay-polish-v5.css')) source = source.replace('@import "./ui-gameplay-polish-v4.css";', '@import "./ui-gameplay-polish-v4.css";\n@import "./ui-gameplay-polish-v5.css";\n@import "./ui-gameplay-motion-v5.css";');
  else if (!source.includes('ui-gameplay-motion-v5.css')) source = source.replace('@import "./ui-gameplay-polish-v5.css";', '@import "./ui-gameplay-polish-v5.css";\n@import "./ui-gameplay-motion-v5.css";');
  await write(path, source);
}

{
  const path = "app/ui-gameplay-polish-v4.css";
  let source = await read(path);
  source = replaceIfPresent(source,
    'font-size: clamp(.29rem,min(.46cqw,.76cqh),.51rem) !important;\n  line-height: 1 !important;',
    'font-size: clamp(.40rem,min(.46cqw,.76cqh),.51rem) !important;\n  margin: 0.15cqw 0.4cqw 0 !important;\n  line-height: 1 !important;'
  );
  source = source.replace('max-width: min(22.8cqw,40cqh) !important;', 'max-width: min(22.8cqw,60cqh) !important;');
  source = replaceIfPresent(source,
    'font-size: clamp(.42rem,min(.65cqw,1.05cqh),.68rem) !important;',
    'margin: 0.4cqw 0.4cqw 0 !important;\n    font-size: clamp(.60rem,min(.65cqw,1.05cqh),.68rem) !important;'
  );
  await write(path, source);
}

{
  const path = "app/lab-legacy.css";
  let source = await read(path);
  source = source.replace('margin-bottom:-3cqh!important;', 'margin-bottom:-2cqh!important;');
  source = source.replace('background:linear-gradient(135deg,var(--hh-orange),var(--hh-gold))!important', 'background:linear-gradient(135deg,var(--hh-paper),var(--hh-gold))!important');
  source = source.replace(/(\.maintenance-choice\s*>\s*i\s*\{[^}]*?color:)\s*#e9c76f/gs, '$1 #1d2035');
  source = source.replace(/(\.maintenance-choice\s*>\s*strong\s*\{[^}]*?color:)\s*#fff7e6/gs, '$1 #1d2035');
  source = source.replace(/(\.maintenance-choice\s*>\s*b\s*\{[^}]*?color:)\s*#e8c66e/gs, '$1 #1d2035');
  source = source.replace(/(\.maintenance-choice\s*>\s*small\s*\{[^}]*?)margin:\s*0\s*!important;/gs, '$1margin-top: 4px !important;');
  source = source.replace(/(\.maintenance-choice\s*>\s*small\s*\{[^}]*?color:)\s*#c0c9d4\s*!important;/gs, '$1 #1d2035 !important;');
  source = source.replace(/(\.maintenance-choice\s*>\s*small\s*\{[^}]*?)font:\s*11px\/1\.45\s+Arial\s*!important;/gs, '$1font: 12px Arial !important;');
  await write(path, source);
}

{
  const path = "app/game.css";
  let source = await read(path);
  source = source.replace(/(\.original-card\.is-selected:after\s*\{[\s\S]*?)content:\s*"ATACANTE";/, '$1content: "";');
  source = source.replace(/(\.original-card\.is-selected:after\s*\{[\s\S]*?)background:\s*#c78623;/, '$1background: #c7852300;');
  await write(path, source);
}

// ---------------------------------------------------------------------------
// React presentation: external negative-state rail, rotated exhausted cards,
// centered native drag ghost, transient damage pulse and anchored hero labels.
// ---------------------------------------------------------------------------
{
  const path = "app/page.tsx";
  let source = await read(path);

  const oldActive = 'const activeUnitEffect=(player:Player,unit:Unit)=>{if(unit.impacting)return"IMPACTO";if(unit.suffocated)return"SILÊNCIO";if(unit.frozen)return"GELO ARCANO";if(unit.stunned)return"ATORDOAMENTO";if(unit.immobilized)return"APRISIONADA";const modifiers=statModifiers(player,unit);if(modifiers.atk<0||modifiers.hp<0)return"ENFRAQUECIMENTO";return""};';
  const newActive = 'const activeUnitEffect=(_player:Player,unit:Unit)=>unit.impacting?"IMPACTO":"";';
  source = replaceIfPresent(source, oldActive, newActive);

  if (!source.includes('const centerDragPreview=')) {
    const marker = 'const markerAmount=(unit:Unit)=>{const markers=(unit as any).markers;return typeof markers==="number"?markers:Object.values(markers||{}).reduce((sum,value)=>sum+Number(value||0),0)};';
    const helper = marker + '\n const centerDragPreview=(event:React.DragEvent<HTMLElement>)=>{const node=event.currentTarget;if(!event.dataTransfer||!node)return;const rect=node.getBoundingClientRect();event.dataTransfer.setDragImage(node,rect.width/2,rect.height/2)};';
    source = replaceIfPresent(source, marker, helper);
  }

  const oldKeywords = 'const liveKeywordNames=unit?[...new Set((unit.suffocated?["Sufocado"]:[...card.tags,...(unit.temporaryTags||[]),...(unit.grantedKeywords||[]),unit.frozen?"Congelado":"",unit.stunned?"Atordoado":"",unit.immobilized?"Imobilizado":""].filter(Boolean)).map(tag=>keywordEntry(tag)?.key).filter((tag):tag is string=>!!tag))]:[];';
  const newKeywords = 'const negativeStatuses=unit?[unit.summoning?{key:"Enjoo",icon:"◷",tip:"Enjoo de invocação: esta carta não pode atacar nem usar efeitos ativáveis no turno em que entra em campo."}:null,unit.suffocated?{key:"Sufocado",icon:"⊘",tip:"Sufocado: efeitos e palavras-chave positivas desta carta ficam ignorados."}:null,unit.frozen?{key:"Congelado",icon:"❄",tip:"Congelado: a Ofensividade desta criatura fica 0 enquanto o efeito durar."}:null,unit.stunned?{key:"Atordoado",icon:"✹",tip:"Atordoado: esta criatura não pode atacar nem defender."}:null,unit.immobilized?{key:"Imobilizado",icon:"⌁",tip:"Imobilizado: esta criatura não desvira normalmente na próxima manutenção."}:null,(modifiers.atk<0||modifiers.hp<0)?{key:"Enfraquecido",icon:"↓",tip:"Enfraquecido: esta carta está sofrendo redução de atributos."}:null].filter((status):status is {key:string;icon:string;tip:string}=>!!status):[];const negativeKeywordKeys=new Set(["Sufocado","Congelado","Atordoado","Imobilizado"]);const liveKeywordNames=unit?[...new Set((unit.suffocated?[]:[...card.tags,...(unit.temporaryTags||[]),...(unit.grantedKeywords||[])].filter(Boolean)).map(tag=>keywordEntry(tag)?.key).filter((tag):tag is string=>!!tag&&!negativeKeywordKeys.has(tag)))]:[];';
  source = replaceIfPresent(source, oldKeywords, newKeywords);

  source = replaceIfPresent(source,
    'return <span className={`card-frame ${small?"is-small":""}`}><button',
    'return <span className={`card-frame ${small?"is-small":""}`} data-unit-id={unit?.uid}><button'
  );

  if (!source.includes('className="field-negative-statuses"')) {
    source = source.replace('</button>{unit&&liveKeywordNames.length>0?', '</button>{unit&&negativeStatuses.length>0?<span className="field-negative-statuses" aria-label={negativeStatuses.map(status=>status.key).join(", ")}>{negativeStatuses.map(status=><i key={status.key} data-status={status.key} title={status.tip} aria-label={status.tip}>{status.icon}</i>)}</span>:null}{unit&&liveKeywordNames.length>0?');
  }

  source = source.replace('activeEffect={support.suffocated?"SUFOCADA":"EFEITO ATIVO"}', 'activeEffect={support.suffocated?"":"EFEITO ATIVO"}');

  source = source.replace('className="hero-power-trigger" tabIndex={0}', 'className="hero-power-trigger" data-hero-role={enemy?"enemy":"ally"} tabIndex={0}');
  if (!source.includes('className="hero-short-name"')) {
    source = source.replace('   <RemoteCardArt page={d.heroPage} name={d.name} priority/>', '   <span className="hero-short-name">{player.heroId==="goblin"?"Sr. Goblin":heroDisplayName(player.heroId)}</span>\n   <RemoteCardArt page={d.heroPage} name={d.name} priority/>');
  }

  source = source.replace('onDragStart={e=>{setDragging({index:i,type:c.type});', 'onDragStart={e=>{centerDragPreview(e);setDragging({index:i,type:c.type});');

  if (!source.includes('damageUiSnapshotRef')) {
    source = source.replace('const currentGameRef=useRef<Game|null>(null);', 'const currentGameRef=useRef<Game|null>(null);\nconst damageUiSnapshotRef=useRef<{life:[number,number];damage:Record<string,number>}|null>(null);');
  }

  if (!source.includes('const pulseDamageUi=')) {
    const marker = 'useEffect(()=>{currentGameRef.current=game},[game]);';
    const effect = marker + '\n useEffect(()=>{if(!game){damageUiSnapshotRef.current=null;return}const units=[...game.players[0].board,...game.players[0].support,...(game.players[0].terrain?[game.players[0].terrain]:[]),...game.players[1].board,...game.players[1].support,...(game.players[1].terrain?[game.players[1].terrain]:[])],next={life:[game.players[0].life,game.players[1].life] as [number,number],damage:Object.fromEntries(units.map(unit=>[unit.uid,Number(unit.damage||0)]))},previous=damageUiSnapshotRef.current;const pulseDamageUi=(selector:string)=>{const node=document.querySelector<HTMLElement>(selector);if(!node)return;node.classList.remove("damage-hit");void node.offsetWidth;node.classList.add("damage-hit");window.setTimeout(()=>node.classList.remove("damage-hit"),540)};if(previous){if(next.life[0]<previous.life[0])pulseDamageUi(\'[data-hero-role="ally"]\');if(next.life[1]<previous.life[1])pulseDamageUi(\'[data-hero-role="enemy"]\');for(const [uid,amount] of Object.entries(next.damage))if(amount>Number(previous.damage[uid]||0))pulseDamageUi(`[data-unit-id="${CSS.escape(uid)}"]`)}damageUiSnapshotRef.current=next},[game]);';
    source = replaceIfPresent(source, marker, effect);
  }

  await write(path, source);
}

// ---------------------------------------------------------------------------
// Rules: one eligible Image replacement auto-resolves; adjacent damage keeps a
// slot snapshot so it still resolves after primary lethal damage removes target.
// ---------------------------------------------------------------------------
{
  const path = "app/rules-engine/effects.mjs";
  let source = await read(path);
  source = source.replace('const chosenId = selectedIds(context)[0];\n\n    // The printed condition is optional:', 'const chosenId = selectedIds(context)[0] || (candidates.length === 1 ? (candidates[0].uid || candidates[0].id) : null);\n\n    // The printed condition is optional:');

  source = source.replace(/  damageAdjacent\(state, effect, context\) \{[\s\S]*?\n  \},\n  heal\(state, effect, context\) \{/,
`  damageAdjacent(state, effect, context) {
    const selectedId = context.targetIds?.[0];
    const selected = findUnit(state, selectedId);
    const snapshots = [...(context.targetSnapshots || []), ...(context.event?.targetSnapshots || [])];
    const snapshot = snapshots.find((entry) => entry?.id === selectedId);
    const owner = selected ? state.players.findIndex((entry) => entry.board.includes(selected)) : snapshot?.owner;
    const board = owner != null && owner >= 0 ? player(state, owner).board : null;
    const slot = selected ? (selected.slot ?? board?.indexOf(selected)) : snapshot?.slot;
    if (!board || slot == null) return;
    for (const target of board.filter((unit) => Math.abs((unit.slot ?? board.indexOf(unit)) - slot) === 1)) defaultEffectHandlers.damage(state, { type: "damage", amount: effect.amount }, { ...context, targetIds: [target.uid || target.id] });
  },
  heal(state, effect, context) {`);
  await write(path, source);
}

{
  const path = "app/rules-engine/engine.mjs";
  let source = await read(path);

  const duplicated = '  if (condition.controllerControlsOtherSubtype) { const preEntry = event.preEntryControlledIds; const candidates = state.players[owner].board.filter((card) => Array.isArray(preEntry) ? preEntry.includes(card.uid || card.id) : (card.uid || card.id) !== (source.uid || source.id)); if (!candidates.some((card) => subtype(card, condition.controllerControlsOtherSubtype))) return false; }\n  if (condition.controllerControlsSubtype) { const entry = state.players[owner]; const controlled = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])]; if (!controlled.some((card) => subtype(card, condition.controllerControlsSubtype))) return false; }\n  if (condition.controllerControlsOtherSubtype) { const preEntry = event.preEntryControlledIds; const candidates = state.players[owner].board.filter((card) => Array.isArray(preEntry) ? preEntry.includes(card.uid || card.id) : (card.uid || card.id) !== (source.uid || source.id)); if (!candidates.some((card) => subtype(card, condition.controllerControlsOtherSubtype))) return false; }';
  const clean = '  if (condition.controllerControlsOtherSubtype) { const preEntry = event.preEntryControlledIds; const candidates = state.players[owner].board.filter((card) => Array.isArray(preEntry) ? preEntry.includes(card.uid || card.id) : (card.uid || card.id) !== (source.uid || source.id)); if (!candidates.some((card) => subtype(card, condition.controllerControlsOtherSubtype))) return false; }\n  if (condition.controllerControlsSubtype) { const entry = state.players[owner]; const controlled = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])]; if (!controlled.some((card) => subtype(card, condition.controllerControlsSubtype))) return false; }';
  source = replaceIfPresent(source, duplicated, clean);

  const oldDecisionContext = 'const decisionContext = { ...decision.context, decisionOwner: item.command.owner, choiceIndex: item.command.choiceIndex, selectedCardId: item.command.selectedCardId, targetIds: item.command.targetIds ?? decision.context?.targetIds };';
  const newDecisionContext = 'const resolvedTargetIds=item.command.targetIds ?? decision.context?.targetIds ?? [];const targetSnapshots=resolvedTargetIds.map((id)=>{const owner=unitOwner(state,id);if(owner<0)return null;const target=permanentUnits(state.players[owner]).find((card)=>card.uid===id||card.id===id);return target?{id,owner,slot:target.slot}:null}).filter(Boolean);const decisionContext = { ...decision.context, decisionOwner: item.command.owner, choiceIndex: item.command.choiceIndex, selectedCardId: item.command.selectedCardId, targetIds: resolvedTargetIds, targetSnapshots };';
  source = replaceIfPresent(source, oldDecisionContext, newDecisionContext);

  const oldCombatDamage = 'stack.push({ kind: "event", event: { type: "onCombatDamage", owner: attackerOwner, sourceId: attacker.uid, source: attacker, targetIds: defender ? [defender.uid] : [], amount: damageDealtByAttacker } });';
  const newCombatDamage = 'stack.push({ kind: "event", event: { type: "onCombatDamage", owner: attackerOwner, sourceId: attacker.uid, source: attacker, targetIds: defender ? [defender.uid] : [], targetSnapshots: defender ? [{ id: defender.uid, owner: defenderOwner, slot: defender.slot }] : [], amount: damageDealtByAttacker } });';
  source = replaceIfPresent(source, oldCombatDamage, newCombatDamage);

  await write(path, source);
}

// ---------------------------------------------------------------------------
// Regression coverage for automatic replacement and image First Act damage.
// ---------------------------------------------------------------------------
{
  const path = "tests/rules-engine.test.mjs";
  let source = await read(path);
  if (!source.includes('single eligible Draconic Illusion replacement auto-selects')) {
    source += `\n\ntest("single eligible Draconic Illusion replacement auto-selects", () => {\n  const game = state(); game.round = 3;\n  const young = { uid: "young", id: "young", name: "Dragão Jovem", type: "Criatura", slot: 2, generatedImage: true, imageCard: true, summoning: false, exhausted: false, damage: 0, tags: [], abilities: [] };\n  game.players[0].board.push(young);\n  game.players[0].extraDeck = [compileCard({ id: "p25", page: 25, name: "Dragão Ancião", type: "Criatura", cost: 0, text: "" })];\n  defaultEffectHandlers.replaceImage(game, { type: "replaceImage", oldName: "Dragão Jovem", newName: "Dragão Ancião" }, { owner: 0, sourceId: "illusion" });\n  assert.equal(game.pendingDecision, undefined);\n  assert.equal(game.players[0].board.some((card) => card.name === "Dragão Jovem"), false);\n  assert.equal(game.players[0].board.some((card) => card.name === "Dragão Ancião"), true);\n});\n\ntest("Dragão Ancião First Act applies primary and adjacent damage after target selection", () => {\n  const game = state();\n  const ancient = { ...compileCard({ id: "p25", page: 25, name: "Dragão Ancião", type: "Criatura", cost: 0, text: "" }), uid: "ancient", slot: 0, generatedImage: true, imageCard: true, summoning: true, exhausted: false, damage: 0 };\n  game.players[0].board.push(ancient);\n  game.players[1].board.push(\n    { uid: "left", id: "left", type: "Criatura", name: "Left", slot: 1, atk: 1, hp: 6, damage: 0, tags: [], abilities: [], exhausted: false, summoning: false },\n    { uid: "center", id: "center", type: "Criatura", name: "Center", slot: 2, atk: 1, hp: 5, damage: 0, tags: [], abilities: [], exhausted: false, summoning: false },\n    { uid: "right", id: "right", type: "Criatura", name: "Right", slot: 3, atk: 1, hp: 6, damage: 0, tags: [], abilities: [], exhausted: false, summoning: false }\n  );\n  const pending = executeCommand(game, { type: "emit", event: { type: "onEnter", owner: 0, sourceId: "ancient", cardId: "ancient", card: ancient } }).state;\n  assert.equal(pending.pendingDecision?.sourceName, "Dragão Ancião");\n  const resolved = executeCommand(pending, { type: "resolveDecision", owner: 0, targetIds: ["center"] }).state;\n  assert.equal(resolved.players[1].board.some((card) => card.uid === "center"), false);\n  assert.equal(resolved.players[1].board.find((card) => card.uid === "left")?.damage, 2);\n  assert.equal(resolved.players[1].board.find((card) => card.uid === "right")?.damage, 2);\n});\n`;
  }
  await write(path, source);
}

console.log("UI interaction/rules polish v5 applied successfully.");
