import { readFile, writeFile } from "node:fs/promises";

const normalize = (value) => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const read = async (path) => normalize(await readFile(path, "utf8"));
const write = (path, value) => writeFile(path, normalize(value));

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Patch point not found: ${label}`);
  return source.replace(before, after);
}

// ---------------------------------------------------------------------------
// CSS authority import.
// ---------------------------------------------------------------------------
{
  const path = "app/lab.css";
  let source = await read(path);
  if (!source.includes('ui-gameplay-polish-v4.css')) {
    source = source.replace('@import "./rules-interaction-v2.css";', '@import "./rules-interaction-v2.css";\n@import "./ui-gameplay-polish-v4.css";');
  }
  await write(path, source);
}

// ---------------------------------------------------------------------------
// Client presentation and interaction.
// ---------------------------------------------------------------------------
{
  const path = "app/page.tsx";
  let source = await read(path);

  // Summoning sickness blocks any activated effect in the UI, regardless of
  // whether the permanent is a Creature or Artifact. Investida works because
  // those creatures enter with summoning=false.
  source = source.replace(
    'artifactSick=unit.type==="Artefato"&&!!unit.summoning;return !artifactSick&&!used&&canActivateCard',
    'summoningSick=!!unit.summoning;return !summoningSick&&!used&&canActivateCard'
  );

  // Remove upgrade/relic labels from the battlefield while retaining genuine
  // negative/semantic statuses such as frozen, stunned and suffocated.
  const oldActive = 'const activeUnitEffect=(player:Player,unit:Unit)=>{if(unit.impacting)return"IMPACTO";if(unit.suffocated)return"SILÊNCIO";if(unit.frozen)return"GELO ARCANO";if(unit.stunned)return"ATORDOAMENTO";if(unit.immobilized)return"APRISIONADA";const modifiers=statModifiers(player,unit);if(modifiers.atk>0&&modifiers.hp>0)return"ASCENSÃO";if(modifiers.atk>0)return"ÍMPETO";if(modifiers.hp>0)return"FORTIFICAÇÃO";if(modifiers.atk<0||modifiers.hp<0)return"ENFRAQUECIMENTO";if(player.support.some(card=>card.attachedTo===unit.uid))return"RELICÁRIO";return""};';
  const newActive = 'const activeUnitEffect=(player:Player,unit:Unit)=>{if(unit.impacting)return"IMPACTO";if(unit.suffocated)return"SILÊNCIO";if(unit.frozen)return"GELO ARCANO";if(unit.stunned)return"ATORDOAMENTO";if(unit.immobilized)return"APRISIONADA";const modifiers=statModifiers(player,unit);if(modifiers.atk<0||modifiers.hp<0)return"ENFRAQUECIMENTO";return""};';
  if (source.includes(oldActive)) source = source.replace(oldActive, newActive);

  source = source.replace(
    '{unit.summoning&&<i className="summoning-sickness-badge" title={unit.type==="Artefato"?"Enjoo: este Artefato não pode ativar efeitos no turno em que entra em campo.":"Enjoo de Invocação: não pode atacar neste turno."}>ENJOO</i>}',
    '{unit.summoning&&<i className="summoning-sickness-badge summoning-sickness-icon" title="Enjoo de invocação: esta carta não pode atacar nem usar efeitos ativáveis no turno em que entra em campo." aria-label="Enjoo de invocação">◷</i>}'
  );

  // Remove purely decorative attachment terminology from field cards.
  source = source.replace('{linked&&<small>VINCULADO</small>}', '');

  // During the defender decision the opposing attacker must remain selected so
  // the responsive CSS can give it a strong red combat highlight.
  source = source.replace(
    '<BattlefieldRows player={foe} enemy ruleTargetIds={engineTargetIds}',
    '<BattlefieldRows player={foe} enemy selectedAttacker={combatAction?.attackerOwner===1?combatAction.attackerUid:undefined} ruleTargetIds={engineTargetIds}'
  );

  await write(path, source);
}

// ---------------------------------------------------------------------------
// Canonical zone cleanup and Anel de Esmeralda.
// ---------------------------------------------------------------------------
{
  const path = "app/rules-engine/effects.mjs";
  let source = await read(path);

  if (!source.includes('const cleanCardForHiddenZone =')) {
    const marker = 'const sendToPrintedGraveDestination = (entry, card, metadata = {}) => {';
    const index = source.indexOf(marker);
    if (index < 0) throw new Error("Patch point not found: hidden-zone cleanup helper");
    const helper = `const cleanCardForHiddenZone = (card, metadata = {}) => {\n  const copy = { ...card, ...metadata };\n  for (const key of [\n    "exhausted", "summoning", "attackedThisTurn", "attacksThisTurn", "defenseUses",\n    "frozen", "stunned", "suffocated", "immobilized", "impacting", "activatedThisTurn",\n    "temporaryAtk", "temporaryHp", "temporaryTags", "targetClass", "selected"\n  ]) delete copy[key];\n  return copy;\n};\n`;
    source = source.slice(0, index) + helper + source.slice(index);
  }

  source = source.replace(
    'destination.push({ ...card, ...metadata });',
    'destination.push(cleanCardForHiddenZone(card, metadata));'
  );

  source = source.replace(
    'if (removed) player(state, removed.owner).hand.push(removed.card);',
    'if (removed) player(state, removed.owner).hand.push(cleanCardForHiddenZone(removed.card));'
  );

  source = source.replace(
    'if (removed) player(state, removed.owner).obscuro.push(removed.card);',
    'if (removed) player(state, removed.owner).obscuro.push(cleanCardForHiddenZone(removed.card));'
  );

  // Max-energy effects modify the ceiling only. Anel de Esmeralda therefore
  // no longer grants an immediate point of current energy as a side effect.
  source = source.replace(
    'gainMaxEnergy(state, effect, context) { const entry = player(state, context.owner); entry.maxEnergy = Math.min(10, (entry.maxEnergy || 0) + (effect.amount || 1)); entry.energy = Math.min(10, (entry.energy || 0) + (effect.amount || 1)); },',
    'gainMaxEnergy(state, effect, context) { const entry = player(state, context.owner); entry.maxEnergy = Math.min(10, (entry.maxEnergy || 0) + (effect.amount || 1)); },'
  );

  await write(path, source);
}

// ---------------------------------------------------------------------------
// Engine authority: generic summoning sickness + automatic class conditions.
// ---------------------------------------------------------------------------
{
  const path = "app/rules-engine/engine.mjs";
  let source = await read(path);

  source = source.replace(
    'if (source.type === "Artefato" && (source.summoning || source.enteredRound === state.round)) throw new RulesViolation("summoning-sickness");',
    'if (["Criatura", "Artefato"].includes(source.type) && (source.summoning || source.enteredRound === state.round)) throw new RulesViolation("summoning-sickness");'
  );

  // Remove a duplicate guard left by an older migration.
  const duplicated = '  if (condition.controllerControlsOtherSubtype) { const preEntry = event.preEntryControlledIds; const candidates = state.players[owner].board.filter((card) => Array.isArray(preEntry) ? preEntry.includes(card.uid || card.id) : (card.uid || card.id) !== (source.uid || source.id)); if (!candidates.some((card) => subtype(card, condition.controllerControlsOtherSubtype))) return false; }\n  if (condition.controllerControlsOtherSubtype) { const preEntry = event.preEntryControlledIds; const candidates = state.players[owner].board.filter((card) => Array.isArray(preEntry) ? preEntry.includes(card.uid || card.id) : (card.uid || card.id) !== (source.uid || source.id)); if (!candidates.some((card) => subtype(card, condition.controllerControlsOtherSubtype))) return false; }';
  const single = '  if (condition.controllerControlsOtherSubtype) { const preEntry = event.preEntryControlledIds; const candidates = state.players[owner].board.filter((card) => Array.isArray(preEntry) ? preEntry.includes(card.uid || card.id) : (card.uid || card.id) !== (source.uid || source.id)); if (!candidates.some((card) => subtype(card, condition.controllerControlsOtherSubtype))) return false; }';
  if (source.includes(duplicated)) source = source.replace(duplicated, single);

  if (!source.includes('condition.controllerControlsSubtype')) {
    source = source.replace(
      single,
      `${single}\n  if (condition.controllerControlsSubtype) { const entry = state.players[owner]; const controlled = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])]; if (!controlled.some((card) => subtype(card, condition.controllerControlsSubtype))) return false; }`
    );
  }

  await write(path, source);
}

// ---------------------------------------------------------------------------
// Explicit no-target conditional card: Sabedoria Ancestral.
// Conditions that inspect the field should never manufacture a target step.
// ---------------------------------------------------------------------------
{
  const path = "app/rules-engine/card-rules.mjs";
  let source = await read(path);
  if (!source.includes('p15: [ability("onPlay"')) {
    const marker = '  p16: [ability("onPlay"';
    const index = source.indexOf(marker);
    if (index < 0) throw new Error("Patch point not found: p15 rule insertion");
    const rule = '  p15: [ability("onPlay", [effect("conditionalDrawByControlledSubtype", { subtype: "Dragão", ifTrue: 2, ifFalse: 1 })])],\n';
    source = source.slice(0, index) + rule + source.slice(index);
  }
  await write(path, source);
}

{
  const path = "app/rules-engine/effects.mjs";
  let source = await read(path);
  if (!source.includes('conditionalDrawByControlledSubtype(state')) {
    const marker = '  gainEnergy(state, effect, context) {';
    const index = source.indexOf(marker);
    if (index < 0) throw new Error("Patch point not found: automatic class condition handler");
    const handler = '  conditionalDrawByControlledSubtype(state, effect, context) { const entry = player(state, context.owner); const controlled = [...(entry.board || []), ...(entry.support || []), ...(entry.terrain ? [entry.terrain] : [])]; const amount = controlled.some((card) => !effect.subtype || hasSubtype(card, effect.subtype)) ? (effect.ifTrue ?? 0) : (effect.ifFalse ?? 0); if (amount > 0) defaultEffectHandlers.draw(state, { type: "draw", amount }, context); },\n';
    source = source.slice(0, index) + handler + source.slice(index);
  }
  await write(path, source);
}

console.log("UI/rules polish v4 applied successfully.");
