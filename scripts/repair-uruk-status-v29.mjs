import { readFile, writeFile } from "node:fs/promises";

const read = async (path) => (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
const write = (path, value) => writeFile(path, value);
const replaceOnce = (source, before, after, label) => {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`v29 patch point not found: ${label}`);
  return source.replace(before, after);
};

// Canonical rules for the Uruk cards reported in this pass.
{
  const path = "app/rules-engine/card-rules.mjs";
  let source = await read(path);

  const p59 = '  p59: [ability("static", [effect("costModifier", { selector: { controller: "self", type: "Feitiço", zone: "hand" }, amount: -1, during: "controllerTurn" })])],';
  const additions = [
    '  p57: [ability("onPlay", [effect("reduceEnemyAttackUntilControllerMaintenance", { amount: 2 }), effect("grantNextElementEffect", { element: "Fogo", keyword: "Sufocado", duration: "untilNextTurn" })])],',
    '  p64: [ability("onPlay", [effect("damageByAdjacentCount", { target: "anyCreature", selections: 1, baseAmount: 1, perAdjacent: 1 }), effect("grantNextElementEffect", { element: "Água", keyword: "Congelado", duration: "untilNextTurn" })])],',
    '  p79: [ability("onSpellCast", [effect("draw", { amount: 1 })], [], { condition: { eventOwnerIsController: true, controllerTurn: true, firstEachTurn: true }, usageLimit: { count: 1, period: "turn" } })],'
  ];
  if (!source.includes(additions[0])) {
    if (!source.includes(p59)) throw new Error("v29 p59 rules anchor not found");
    source = source.replace(p59, `${additions.join("\n")}\n${p59}`);
  }

  const oldP70 = '  p70: [ability("onPlay", [effect("controllerChoice", { choices: [[effect("createUniqueImage", { name: "Maestria Elemental: Piromancia" })], [effect("createUniqueImage", { name: "Maestria Elemental: Hidromancia" })], [effect("createUniqueImage", { name: "Maestria Elemental: Geomancia" })], [effect("createUniqueImage", { name: "Maestria Elemental: Aeromancia" })]] })])],';
  const newP70 = '  p70: [ability("onPlay", [effect("moveSelf", { destination: "grave" }), effect("controllerChoice", { choices: [[effect("createUniqueImage", { name: "Maestria Elemental: Piromancia" })], [effect("createUniqueImage", { name: "Maestria Elemental: Hidromancia" })], [effect("createUniqueImage", { name: "Maestria Elemental: Geomancia" })], [effect("createUniqueImage", { name: "Maestria Elemental: Aeromancia" })]] })])],';
  source = replaceOnce(source, oldP70, newP70, "Maestria Elemental canonical resolution");
  await write(path, source);
}

// Add precise handlers: Sandstorm only debuffs the enemy board; High Voltage damages only the selected creature.
{
  const path = "app/rules-engine/effects.mjs";
  let source = await read(path);
  const anchor = '  damageAdjacent(state, effect, context) {';
  const handlers = `  reduceEnemyAttackUntilControllerMaintenance(state, effect, context) {\n    const amount = Math.max(0, Number(effect.amount || 0));\n    for (const target of player(state, 1 - context.owner).board || []) {\n      target.modifiers ||= [];\n      target.modifiers.push({ attack: -amount, health: 0, duration: "untilControllerMaintenance", sourceId: context.sourceId, expiresOnMaintenanceOwner: context.owner });\n    }\n  },\n  damageByAdjacentCount(state, effect, context) {\n    const targetId = selectedIds(context)[0];\n    const target = findUnit(state, targetId);\n    if (!target) throw new RulesViolation("target-required");\n    const owner = state.players.findIndex((entry) => (entry.board || []).includes(target));\n    if (owner < 0) throw new RulesViolation("target-required");\n    const board = player(state, owner).board || [];\n    const slot = target.slot ?? board.indexOf(target);\n    const adjacent = board.filter((unit) => unit !== target && Math.abs((unit.slot ?? board.indexOf(unit)) - slot) === 1).length;\n    const amount = Math.max(0, Number(effect.baseAmount || 0) + adjacent * Number(effect.perAdjacent || 0));\n    defaultEffectHandlers.damage(state, { type: "damage", amount }, { ...context, targetIds: [targetId] });\n  },\n`;
  if (!source.includes("reduceEnemyAttackUntilControllerMaintenance(state")) {
    if (!source.includes(anchor)) throw new Error("v29 damageAdjacent handler anchor not found");
    source = source.replace(anchor, handlers + anchor);
  }
  await write(path, source);
}

// Engine expiry for effects that last until the caster's next maintenance.
{
  const path = "app/rules-engine/engine.mjs";
  let source = await read(path);
  const needle = 'if (state.phase === "manutencao") { const previousActive = 1 - state.active; state.players[previousActive].goblinTurnCardsPlayed = 0; state.active = 1 - state.active; state.round += 1; const entry = state.players[state.active];';
  const replacement = 'if (state.phase === "manutencao") { const previousActive = 1 - state.active; state.players[previousActive].goblinTurnCardsPlayed = 0; state.active = 1 - state.active; state.round += 1; state.players.forEach((candidate) => (candidate.board || []).forEach((unit) => { unit.modifiers = (unit.modifiers || []).filter((modifier) => modifier.expiresOnMaintenanceOwner !== state.active); })); const entry = state.players[state.active];';
  source = replaceOnce(source, needle, replacement, "canonical maintenance modifier expiry");
  await write(path, source);
}

// Client runtime: remove the duplicate Maestria selector and expire Sandstorm at either player's correct maintenance.
{
  const path = "app/page.tsx";
  let source = await read(path);

  const oldChoices = 'const imageChoices:Record<number,string[]>={70:["Maestria Elemental: Piromancia","Maestria Elemental: Hidromancia","Maestria Elemental: Geomancia","Maestria Elemental: Aeromancia"],87:["Ignis, a Chama Eterna","Terron, o Guardião Ancestral","Undaris, a Voz do Oceano","Zephyrus, o Relâmpago Voraz"]};';
  const newChoices = 'const imageChoices:Record<number,string[]>={87:["Ignis, a Chama Eterna","Terron, o Guardião Ancestral","Undaris, a Voz do Oceano","Zephyrus, o Relâmpago Voraz"]};';
  source = replaceOnce(source, oldChoices, newChoices, "single Maestria Elemental selector");

  const maintenanceNeedle = 'const resolveMaintenanceTriggers=(g:Game,owner:0|1)=>{\n const p=g.players[owner],foe=g.players[owner===0?1:0];';
  const maintenanceReplacement = 'const resolveMaintenanceTriggers=(g:Game,owner:0|1)=>{\n g.players.forEach(player=>player.board.forEach(unit=>{unit.modifiers=(unit.modifiers||[]).filter((modifier:any)=>modifier.expiresOnMaintenanceOwner!==owner)}));\n const p=g.players[owner],foe=g.players[owner===0?1:0];';
  source = replaceOnce(source, maintenanceNeedle, maintenanceReplacement, "legacy maintenance modifier expiry");

  await write(path, source);
}

// Prominent hero status cues, visually below the evolve button. Dedicated stylesheet keeps older visual scripts untouched.
{
  const cssPath = "app/ui-hero-status-v29.css";
  const css = `/* Hero status cues v29 */\n.screen-game .player-hero:not(.enemy) .hero-status-cues{left:auto!important;right:7px!important;top:auto!important;bottom:-80px!important;transform:none!important;z-index:42!important;gap:6px!important;animation:heroStatusCuePulse 1.65s ease-in-out infinite}\n.screen-game .player-hero:not(.enemy) .hero-status-cues.cost{top:auto!important;bottom:-116px!important}\n.screen-game .player-hero:not(.enemy) .hero-status-cues span{min-width:142px!important;padding:7px 12px!important;border:2px solid color-mix(in srgb,var(--deck,#69d5ff) 78%,white)!important;border-radius:9px!important;background:linear-gradient(135deg,color-mix(in srgb,var(--deck,#69d5ff) 34%,#07131e),#07131ef5)!important;color:#fff!important;text-align:center!important;font:900 11px/1.15 system-ui!important;letter-spacing:.075em!important;text-transform:uppercase!important;box-shadow:0 0 0 1px #ffffff24,0 0 18px color-mix(in srgb,var(--deck,#69d5ff) 64%,transparent),0 7px 18px #000b!important;text-shadow:0 1px 4px #000!important}\n.screen-game .player-hero:not(.enemy) .hero-status-cues span::before{content:\"✦ \";color:#fff4a6}\n@keyframes heroStatusCuePulse{0%,100%{filter:brightness(1);transform:translateY(0)}50%{filter:brightness(1.24);transform:translateY(-2px)}}\n`;
  await write(cssPath, css);

  const globalsPath = "app/globals.css";
  let globals = await read(globalsPath);
  const importLine = '@import "./ui-hero-status-v29.css";';
  if (!globals.includes(importLine)) {
    const imports = [...globals.matchAll(/^@import[^;]+;\n?/gm)];
    const insertAt = imports.length ? imports[imports.length - 1].index + imports[imports.length - 1][0].length : 0;
    globals = globals.slice(0, insertAt) + importLine + "\n" + globals.slice(insertAt);
  }
  await write(globalsPath, globals);
}

console.log("v29 applied: hero status cues emphasized; Maestria selector/base fixed; Athos trigger fixed; Sandstorm and High Voltage corrected.");
