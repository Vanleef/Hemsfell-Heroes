import { readFile, writeFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const write = (path, value) => writeFile(path, value);

function replaceRegex(source, regex, replacement, label) {
  const next = source.replace(regex, replacement);
  if (next === source) throw new Error(`Patch point not found: ${label}`);
  return next;
}

function replaceText(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Patch point not found: ${label}`);
  return source.replace(before, after);
}

// ---------------------------------------------------------------------------
// Compiler: Fura-Fila is a bounded clause; passive triggers and per-turn limits
// become explicit metadata instead of being implicit parser side effects.
// ---------------------------------------------------------------------------
{
  const path = "app/rules-engine/compiler.mjs";
  let source = await read(path);
  if (!source.includes("furaFila: section.label === \"fura-fila\"")) {
    source = replaceRegex(source,
      /export function splitTriggeredSections\(text = ""\) \{[\s\S]*?\n\}\n\nexport function parseCosts/,
`export function splitTriggeredSections(text = "") {
  const source = clean(text);
  const marker = /(primeiro ato|[uú]ltimo suspiro|fura-fila)\\s*:/gi;
  const matches = [...source.matchAll(marker)];
  if (!matches.length) return [{ label: "", text: source }];
  const sections = [];
  let cursor = 0;
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const markerStart = current.index ?? 0;
    if (markerStart > cursor) {
      const independent = clean(source.slice(cursor, markerStart));
      if (independent) sections.push({ label: "", text: independent });
    }
    const bodyStart = markerStart + current[0].length;
    const nextMarker = matches[index + 1]?.index ?? source.length;
    let bodyEnd = nextMarker;
    if (folded(current[1]) === "fura-fila") {
      const period = source.indexOf(".", bodyStart);
      if (period >= 0 && period < bodyEnd) bodyEnd = period + 1;
    }
    const body = clean(source.slice(bodyStart, bodyEnd));
    if (body) sections.push({ label: folded(current[1]), text: body });
    cursor = bodyEnd;
  }
  if (cursor < source.length) {
    const independent = clean(source.slice(cursor));
    if (independent) sections.push({ label: "", text: independent });
  }
  return sections.filter((section) => section.text);
}

export function parseCosts`, "bounded Fura-Fila sections");

    source = replaceText(source,
      '  const buff = raw.match(/([+-]?\\d+)\\s*\\/\\s*([+-]?\\d+)/);',
      '  const buff = raw.match(/([+-]?\\d+)\\s*\\/\\s*([+-]?\\d+)/);\n  const offense = raw.match(/(?:recebe|ganha|concede|d[êe])\\s*\\+?(\\d+)\\s+(?:de\\s+)?ofensividade/i);\n  const vitality = raw.match(/(?:recebe|ganha|concede|d[êe])\\s*\\+?(\\d+)\\s+(?:de\\s+)?vitalidade/i);',
      "Ofensividade/Vitalidade parser");

    source = replaceText(source,
      '  if (buff) add("modifyStats", { attack: Number(buff[1]), health: Number(buff[2]), duration: /turno/.test(value) ? "turn" : "permanent" });',
      '  if (buff) add("modifyStats", { attack: Number(buff[1]), health: Number(buff[2]), duration: /turno/.test(value) ? "turn" : "permanent" });\n  if (!buff && (offense || vitality)) { const policy = targetPolicy(raw); add("modifyStats", { attack: Number(offense?.[1] || 0), health: Number(vitality?.[1] || 0), target: policy.scope === "none" ? "attachedCreature" : policy.scope, selections: policy.selections, duration: /turno/.test(value) ? "turn" : "permanent" }); }',
      "typed stat terminology");

    source = replaceText(source,
      '    return { id: `ability-${index + 1}`, trigger, condition: section.label === "fura-fila" ? { cardsPlayedBeforeThisAtLeast: 1 } : null, costs, effects, sourceText: section.text };',
      '    const usageLimit = /(?:uma|1)\\s+vez\\s+por\\s+turno/i.test(section.text) ? { count: 1, period: "turn" } : undefined;\n    const conditionalPassive = /\\b(quando|sempre que|toda vez que|se )\\b/i.test(section.text) && ![Trigger.PLAY, Trigger.ENTER, Trigger.DESTROYED, Trigger.ACTIVATED].includes(trigger);\n    return { id: `ability-${index + 1}`, trigger, condition: section.label === "fura-fila" ? { cardsPlayedBeforeThisAtLeast: 1 } : null, costs, effects, sourceText: section.text, usageLimit, furaFila: section.label === "fura-fila" ? { requiresCardsPlayedBefore: 1, clause: section.text } : undefined, triggerMeta: { kind: section.label === "fura-fila" ? "conditional-combo" : conditionalPassive ? "conditional-passive" : "direct", scenario: section.text } };',
      "trigger metadata");
  }
  await write(path, source);
}

// ---------------------------------------------------------------------------
// Explicit rules: Image Primeiro Ato follows printed targeting; Trambuco is no
// longer delegated to free-text interpretation.
// ---------------------------------------------------------------------------
{
  const path = "app/rules-engine/card-rules.mjs";
  let source = await read(path);
  source = source.replace('p24: [ability("static", [effect("keyword", { keyword: "Voar" })]), ability("onEnter", [effect("damage", { amount: 3, target: "enemyCreature", selections: 1 })', 'p24: [ability("static", [effect("keyword", { keyword: "Voar" })]), ability("onEnter", [effect("damage", { amount: 3, target: "anyCreature", selections: 1 })');
  source = source.replace('p25: [ability("static", [effect("keyword", { keyword: "Voar" })]), ability("onEnter", [effect("damage", { amount: 5, target: "enemyCreature", selections: 1 })', 'p25: [ability("static", [effect("keyword", { keyword: "Voar" })]), ability("onEnter", [effect("damage", { amount: 5, target: "anyCreature", selections: 1 })');
  if (!source.includes("optionalReequipArtifact")) {
    source = replaceText(source,
      '  p37: [ability("activated", [effect("damageFromSacrificedAttack", { target: "anyCharacter", selections: 1 })], [{ type: "sacrifice", amount: 1, subtype: "Goblin" }], { uiActivation: true, usageLimit: { count: 1, period: "turn" } })],',
      '  p37: [ability("activated", [effect("damageFromSacrificedAttack", { target: "anyCharacter", selections: 1 })], [{ type: "sacrifice", amount: 1, subtype: "Goblin" }], { uiActivation: true, usageLimit: { count: 1, period: "turn" } })],\n  p38: [\n    ability("onEnter", [effect("validateAttachedSubtype", { subtype: "Goblin" }), effect("attachedStats", { attack: 2, health: 0 }), effect("attachedKeyword", { keyword: "Veloz" })]),\n    ability("activated", [effect("reattachArtifact", { target: "allyCreature", requiredSubtype: "Goblin", selections: 1, subtype: "Goblin", attack: 2, keyword: "Veloz", excludeCurrentAttachment: true })], [], { uiActivation: true, usageLimit: { count: 1, period: "turn" }, triggerMeta: { kind: "activated", scenario: "No seu turno, equipe em outro Goblin aliado." } }),\n    ability("onAttachedHostDestroyed", [effect("optionalReequipArtifact", { energyCost: 2, subtype: "Goblin", attack: 2, keyword: "Veloz" })], [], { triggerMeta: { kind: "conditional-passive", scenario: "Quando o Goblin equipado for destruído." } })\n  ],',
      "Trambuco explicit rules");
  }
  await write(path, source);
}

// ---------------------------------------------------------------------------
// Effects: Images inherit their printed type, First Act can safely no-op, and
// attached artifacts can survive a host death when their own rules say so.
// ---------------------------------------------------------------------------
{
  const path = "app/rules-engine/effects.mjs";
  let source = await read(path);

  if (!source.includes("onAttachedHostDestroyed")) {
    source = replaceRegex(source,
      /const sendDetachedArtifacts = \(entry, creature\) => \{[\s\S]*?\n\};/,
`const sendDetachedArtifacts = (state, entry, creature) => {
  const owner = state.players.indexOf(entry);
  const attachments = (entry.support || []).filter((item) => item.attachedTo === creature.uid);
  entry.support = (entry.support || []).filter((item) => item.attachedTo !== creature.uid);
  for (const attachment of attachments) {
    creature.modifiers = (creature.modifiers || []).filter((modifier) => modifier.sourceId !== (attachment.uid || attachment.id));
    creature.grantedKeywords = (creature.grantedKeywords || []).filter((keyword) => !String(keyword).startsWith(`attachment:${attachment.uid || attachment.id}:`));
    const survivesHost = (attachment.abilities || []).some((ability) => ability.trigger === "onAttachedHostDestroyed");
    if (survivesHost) {
      attachment.attachedTo = undefined;
      attachment.slot = creature.slot;
      entry.support.push(attachment);
      queueEvent(state, { type: "onAttachedHostDestroyed", owner, sourceId: attachment.uid || attachment.id, card: attachment, host: creature });
      continue;
    }
    if (attachment.generatedImage || attachment.imageCard) continue;
    const destination = attachment.page === 154 ? entry.obscuro : entry.grave;
    destination.push({ ...attachment, deathCause: "detached", lastZone: "support" });
  }
};`, "detached artifact passive trigger");
    source = source.replace('if (zone === "board") sendDetachedArtifacts(entry, card);', 'if (zone === "board") sendDetachedArtifacts(state, entry, card);');
  }

  source = source.replace('summoning: false, exhausted: false, damage: 0, slot: context.slot ?? 0, abilities: base.abilities || []', 'summoning: base.type === "Artefato" || (base.type === "Criatura" && !(base.tags || []).some((tag) => /investida/i.test(String(tag)))), exhausted: false, damage: 0, slot: context.slot ?? 0, abilities: base.abilities || []');

  if (!source.includes("validateAttachedSubtype(state")) {
    source = replaceText(source,
      '  attachedConditionalStats(state, effect, context) { const source = findUnit(state, context.sourceId); const target = source?.attachedTo ? findUnit(state, source.attachedTo) : null; if (!target) throw new RulesViolation("artifact-target-required"); const excluded = (effect.excludedNames || []).map(normalizedName); if (excluded.includes(normalizedName(effectiveUnitName(state, target)))) return; defaultEffectHandlers.modifyStats(state, { ...effect, type: "modifyStats", target: "attachedCreature" }, context); },',
      '  attachedConditionalStats(state, effect, context) { const source = findUnit(state, context.sourceId); const target = source?.attachedTo ? findUnit(state, source.attachedTo) : null; if (!target) throw new RulesViolation("artifact-target-required"); const excluded = (effect.excludedNames || []).map(normalizedName); if (excluded.includes(normalizedName(effectiveUnitName(state, target)))) return; defaultEffectHandlers.modifyStats(state, { ...effect, type: "modifyStats", target: "attachedCreature" }, context); },\n  validateAttachedSubtype(state, effect, context) { const source = findUnit(state, context.sourceId), target = source?.attachedTo ? findUnit(state, source.attachedTo) : null; if (!source || !target || (effect.subtype && !hasSubtype(target, effect.subtype))) throw new RulesViolation("invalid-attachment-target"); },\n  attachedStats(state, effect, context) { defaultEffectHandlers.modifyStats(state, { type: "modifyStats", target: "attachedCreature", attack: effect.attack || 0, health: effect.health || 0, duration: "attached" }, context); },\n  attachedKeyword(state, effect, context) { const source = findUnit(state, context.sourceId), target = source?.attachedTo ? findUnit(state, source.attachedTo) : null; if (!source || !target) throw new RulesViolation("artifact-target-required"); target.grantedKeywords ||= []; const value = `attachment:${source.uid || source.id}:${effect.keyword}`; if (effect.keyword && !target.grantedKeywords.includes(value)) target.grantedKeywords.push(value); },\n  reattachArtifact(state, effect, context) {\n    const entry = player(state, context.owner), source = findUnit(state, context.sourceId), chosenId = selectedIds(context)[0];\n    if (!source) throw new RulesViolation("artifact-not-found");\n    const eligible = (entry.board || []).filter((card) => (!effect.subtype || hasSubtype(card, effect.subtype)) && card.uid !== source.attachedTo);\n    if (!chosenId) { if (!eligible.length) return; if (state.pendingDecision) throw new RulesViolation("decision-pending"); state.pendingDecision = { kind: "targets", owner: context.owner, effect: { replayEffects: [{ ...effect }] }, context: { ...context, targetIds: [] }, targetSteps: [{ scope: "allyCreature", role: "effect", requiredSubtype: effect.subtype, excludeIds: source.attachedTo ? [source.attachedTo] : [] }], sourceName: source.name || "Artefato" }; return; }\n    const target = eligible.find((card) => card.uid === chosenId || card.id === chosenId); if (!target) throw new RulesViolation("invalid-target");\n    if ((effect.energyCost || 0) > 0) { if (entry.energy < effect.energyCost) throw new RulesViolation("not-enough-energy"); entry.energy -= effect.energyCost; }\n    const previous = source.attachedTo ? findUnit(state, source.attachedTo) : null; if (previous) { previous.modifiers = (previous.modifiers || []).filter((modifier) => modifier.sourceId !== (source.uid || source.id)); previous.grantedKeywords = (previous.grantedKeywords || []).filter((keyword) => !String(keyword).startsWith(`attachment:${source.uid || source.id}:`)); }\n    source.attachedTo = target.uid; source.slot = target.slot;\n    if (effect.attack || effect.health) defaultEffectHandlers.attachedStats(state, effect, context);\n    if (effect.keyword) defaultEffectHandlers.attachedKeyword(state, effect, context);\n  },\n  optionalReequipArtifact(state, effect, context) { const entry = player(state, context.owner), source = findUnit(state, context.sourceId); if (!source || entry.energy < (effect.energyCost || 0)) return; const eligible = (entry.board || []).filter((card) => (!effect.subtype || hasSubtype(card, effect.subtype)) && card.uid !== source.attachedTo); if (!eligible.length) return; queueDecision(state, { type: "optionalReequipArtifact", choices: [[], [{ type: "reattachArtifact", target: "allyCreature", requiredSubtype: effect.subtype, selections: 1, subtype: effect.subtype, energyCost: effect.energyCost, attack: effect.attack, keyword: effect.keyword }]] }, context, "choice"); },',
      "generic attached artifact semantics");
  }

  source = source.replace('if (!removed.card.generatedImage && !removed.card.imageCard) {\n        sendToPrintedGraveDestination(player(state, removed.owner), removed.card, { lastZone: removed.zone, deathCause: "destroy" });\n        queueEvent(state, { type: "onDestroyed", owner: removed.owner, card: removed.card, cardId: removed.card.uid || removed.card.id, sourceId: removed.card.uid || removed.card.id, deathCause: "destroy" });\n      }', 'if (!removed.card.generatedImage && !removed.card.imageCard) sendToPrintedGraveDestination(player(state, removed.owner), removed.card, { lastZone: removed.zone, deathCause: "destroy" });\n      if (!removed.card.suppressDeathTrigger) queueEvent(state, { type: "onDestroyed", owner: removed.owner, card: removed.card, cardId: removed.card.uid || removed.card.id, sourceId: removed.card.uid || removed.card.id, deathCause: "destroy" });');

  await write(path, source);
}

// ---------------------------------------------------------------------------
// Engine: authoritative target filters, Image self-exclusion, targetful
// activated abilities, and Image death triggers.
// ---------------------------------------------------------------------------
{
  const path = "app/rules-engine/engine.mjs";
  let source = await read(path);

  if (!source.includes("targetMatchesStep")) {
    source = replaceRegex(source,
      /function abilityTargetSteps\(ability\) \{[\s\S]*?\n\}\nfunction targetCandidates\(state, owner, step\) \{[\s\S]*?\n\}\nfunction canSatisfyTargetSteps/,
`function abilityTargetSteps(ability) {
  if (ability.sourceText) return (targetPolicy(ability.sourceText).steps || []).filter((step) => step.role !== "sacrifice");
  return (ability.effects || []).flatMap((effect) => {
    const scope = targetScope(effect.target);
    return Array.from({ length: effect.selections ?? (scope === TargetScope.NONE ? 0 : 1) }, () => ({ scope, role: "effect", requiredSubtype: effect.requiredSubtype || effect.subtype, requiredName: effect.requiredName, imageOnly: effect.imageOnly, maxCost: effect.maxCost, excludeIds: effect.excludeIds || [] }));
  }).filter((step) => step.scope !== TargetScope.NONE);
}
function targetMatchesStep(target, id, step) {
  if ((step.excludeIds || []).includes(id)) return false;
  if (step.requiredSubtype && !subtype(target, step.requiredSubtype)) return false;
  if (step.requiredName && String(target?.name || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase() !== String(step.requiredName).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase()) return false;
  if (step.imageOnly && !(target?.generatedImage || target?.imageCard)) return false;
  if (step.maxCost != null && (target?.cost || 0) > step.maxCost) return false;
  return true;
}
function targetCandidates(state, owner, step) {
  const result = [];
  state.players.forEach((entry, targetOwner) => {
    for (const target of permanentUnits(entry)) {
      const id = target.uid || target.id;
      const targetKind = entry.board.includes(target) || target.type === "Criatura" ? "creature" : "permanent";
      if (isValidTarget(step, owner, targetOwner, targetKind) && targetMatchesStep(target, id, step)) result.push(id);
    }
    if (isValidTarget(step, owner, targetOwner, "hero") && !(step.excludeIds || []).includes(targetOwner === owner ? "ally-hero" : "enemy-hero")) result.push(targetOwner === owner ? "ally-hero" : "enemy-hero");
  });
  return result;
}
function canSatisfyTargetSteps`, "authoritative target predicates");
  }

  source = source.replace('if (!unit.suppressDeathTrigger && !unit.generatedImage && !unit.imageCard) stack.push({ kind: "event", event: { type: "onDestroyed", owner, sourceId: unit.uid, cardId: unit.uid, card: unit, deathCause: "effect" } });', 'if (!unit.suppressDeathTrigger) stack.push({ kind: "event", event: { type: "onDestroyed", owner, sourceId: unit.uid, cardId: unit.uid, card: unit, deathCause: "effect" } });');

  if (!source.includes('kind: "activation-targets"')) {
    source = replaceText(source,
      'if (!ability) throw new RulesViolation("ability-not-found"); if (source.type === "Artefato" && (source.summoning || source.enteredRound === state.round)) throw new RulesViolation("summoning-sickness"); if (!canExecuteCard(source, handlers)) throw new RulesViolation("card-not-migrated"); if (!availabilityMatches(state, source, item.command.owner, ability.availability)) throw new RulesViolation("ability-not-available"); actionLabel = source.name || source.uid; if (!usageAvailable(state, source, item.command.owner, ability)) throw new RulesViolation("ability-limit-reached"); validateTargets(state, item.command.owner, [ability], item.command, source); validateCosts(state, ability, item.command); payCosts(state, ability, item.command); claimUsage(state, source, item.command.owner, ability);',
      'if (!ability) throw new RulesViolation("ability-not-found"); if (source.type === "Artefato" && (source.summoning || source.enteredRound === state.round)) throw new RulesViolation("summoning-sickness"); if (!canExecuteCard(source, handlers)) throw new RulesViolation("card-not-migrated"); if (!availabilityMatches(state, source, item.command.owner, ability.availability)) throw new RulesViolation("ability-not-available"); actionLabel = source.name || source.uid; if (!usageAvailable(state, source, item.command.owner, ability)) throw new RulesViolation("ability-limit-reached"); const activationSteps = abilityTargetSteps(ability).map((step) => ({ ...step, excludeIds: ability.effects?.some((effect) => effect.excludeCurrentAttachment) && source.attachedTo ? [...new Set([...(step.excludeIds || []), source.attachedTo])] : step.excludeIds || [] })); if (activationSteps.length && !(item.command.targetIds || []).length) { if (!canSatisfyTargetSteps(state, item.command.owner, activationSteps)) throw new RulesViolation("ability-not-available"); state.pendingDecision = { kind: "activation-targets", owner: item.command.owner, effect: {}, context: { owner: item.command.owner, sourceId: source.uid }, targetSteps: activationSteps, sourceName: source.name, command: { ...item.command } }; continue; } validateTargets(state, item.command.owner, [ability], item.command, source); validateCosts(state, ability, item.command); payCosts(state, ability, item.command); claimUsage(state, source, item.command.owner, ability);',
      "targetful activated ability staging");
  }

  source = source.replace('if (decision.kind === "targets") {\n          const targetIds = item.command.targetIds || []; const steps = decision.targetSteps || [];\n          if (targetIds.length !== steps.length) throw new RulesViolation("invalid-target-count");\n          steps.forEach((step, index) => { const id = targetIds[index]; const hero = /^(?:ally|enemy|controller)-hero$|^hero-[01]$/.test(id || ""); const targetOwner = hero ? (id === "enemy-hero" ? 1 - decision.owner : id === "ally-hero" || id === "controller-hero" ? decision.owner : Number(id.slice(-1))) : unitOwner(state, id); const target = hero || targetOwner < 0 ? null : permanentUnits(state.players[targetOwner]).find((unit) => unit.uid === id || unit.id === id); const targetKind = hero ? "hero" : target && (target.type === "Criatura" || state.players[targetOwner].board.includes(target)) ? "creature" : "permanent"; if (targetOwner < 0 || (!hero && !target) || !isValidTarget(step, decision.owner, targetOwner, targetKind)) throw new RulesViolation("invalid-target"); });\n        }', 'if (decision.kind === "targets" || decision.kind === "activation-targets") {\n          const targetIds = item.command.targetIds || []; const steps = decision.targetSteps || [];\n          if (targetIds.length !== steps.length) throw new RulesViolation("invalid-target-count");\n          steps.forEach((step, index) => { const id = targetIds[index]; const hero = /^(?:ally|enemy|controller)-hero$|^hero-[01]$/.test(id || ""); const targetOwner = hero ? (id === "enemy-hero" ? 1 - decision.owner : id === "ally-hero" || id === "controller-hero" ? decision.owner : Number(id.slice(-1))) : unitOwner(state, id); const target = hero || targetOwner < 0 ? null : permanentUnits(state.players[targetOwner]).find((unit) => unit.uid === id || unit.id === id); const targetKind = hero ? "hero" : target && (target.type === "Criatura" || state.players[targetOwner].board.includes(target)) ? "creature" : "permanent"; if (targetOwner < 0 || (!hero && !target) || !isValidTarget(step, decision.owner, targetOwner, targetKind) || (!hero && !targetMatchesStep(target, id, step)) || (hero && ((step.requiredSubtype || step.requiredName || step.imageOnly || step.maxCost != null) || (step.excludeIds || []).includes(id)))) throw new RulesViolation("invalid-target"); });\n          if (decision.kind === "activation-targets") { state.pendingDecision = null; stack.push(...continuation); stack.push({ kind: "command", command: { ...decision.command, targetIds } }); continue; }\n        }');

  source = replaceText(source,
    'const targetSteps = abilityTargetSteps(trigger.ability); const context = { owner: trigger.owner, sourceId: trigger.ability.replaySourceId || trigger.source.uid, event: item.event, targetIds: item.event.targetIds || [] }; if (targetSteps.length && !context.targetIds.length) { if (!canSatisfyTargetSteps(state, trigger.owner, targetSteps)) continue;',
    'const baseTargetSteps = abilityTargetSteps(trigger.ability); const imageEntering = item.event.type === "onEnter" && (item.event.card?.generatedImage || item.event.card?.imageCard); const targetSteps = imageEntering ? baseTargetSteps.map((step) => ({ ...step, excludeIds: [...new Set([...(step.excludeIds || []), item.event.sourceId].filter(Boolean))] })) : baseTargetSteps; const context = { owner: trigger.owner, sourceId: trigger.ability.replaySourceId || trigger.source.uid, event: item.event, targetIds: item.event.targetIds || [] }; if (targetSteps.length && !context.targetIds.length) { if (!canSatisfyTargetSteps(state, trigger.owner, targetSteps)) continue;',
    "Image First Act self exclusion");

  await write(path, source);
}

// ---------------------------------------------------------------------------
// Client: authoritative engine target choices are selected directly on the
// board. The popup becomes a compact source/consequence information panel.
// ---------------------------------------------------------------------------
{
  const path = "app/page.tsx";
  let source = await read(path);
  source = source.replace('targetSteps?:Array<{scope:string;role?:string;requiredSubtype?:string;requiredName?:string;imageOnly?:boolean}>', 'targetSteps?:Array<{scope:string;role?:string;requiredSubtype?:string;requiredName?:string;imageOnly?:boolean;excludeIds?:string[];maxCost?:number}>');
  source = source.replace('const engineTargetStep=engineDecision?.kind==="targets"?engineDecision.targetSteps?.[engineTargetSelection.length]:undefined;', 'const engineTargetDecision=!!engineDecision&&["targets","activation-targets"].includes(engineDecision.kind);\n const engineTargetStep=engineTargetDecision?engineDecision.targetSteps?.[engineTargetSelection.length]:undefined;');
  source = source.replace('&&(!engineTargetStep.imageOnly||!!(option.card as any).generatedImage||!!(option.card as any).imageCard)&&!engineTargetSelection.includes(option.id))', '&&(!engineTargetStep.imageOnly||!!(option.card as any).generatedImage||!!(option.card as any).imageCard)&&(engineTargetStep.maxCost==null||option.card.cost<=engineTargetStep.maxCost)&&!(engineTargetStep.excludeIds||[]).includes(option.id)&&!engineTargetSelection.includes(option.id))');
  source = source.replace('const selectEngineTarget=(id:string)=>{if(!engineDecision||engineDecision.kind!=="targets")return;', 'const engineTargetIds=engineTargetOptions.map(option=>option.id);\n const engineTargetConsequence=(engineDecision?.effect?.replayEffects||[]).map(decisionEffectLabel).join(" · ")||"Resolver o efeito indicado pela carta";\n const selectEngineTarget=(id:string)=>{if(!engineDecision||!["targets","activation-targets"].includes(engineDecision.kind))return;');

  source = source.replace('const structured=card.abilities?.find(ability=>ability.trigger==="activated"),markerCost=structured?.costs?.some((cost:any)=>cost.type==="removeMarkers"&&cost.amount==="X")?markerAmount(card):undefined,needsInteraction=structured?.costs?.some((cost:any)=>cost.type==="sacrifice")||structured?.effects?.some((effect:any)=>effect.selections||["search","investigate","choice"].includes(effect.type));if(structured&&canExecuteCard(card)&&!needsInteraction){void runRulesCommand({type:"activate",sourceId:uid,abilityId:structured.id,markerAmount:markerCost},0);return}', 'const structured=card.abilities?.find(ability=>ability.trigger==="activated"),markerCost=structured?.costs?.some((cost:any)=>cost.type==="removeMarkers"&&cost.amount==="X")?markerAmount(card):undefined,needsLegacySacrifice=structured?.costs?.some((cost:any)=>cost.type==="sacrifice");if(structured&&canExecuteCard(card)&&!needsLegacySacrifice){void runRulesCommand({type:"activate",sourceId:uid,abilityId:structured.id,markerAmount:markerCost},0);return}');

  source = source.replace('<PlayerHero player={foe} enemy targetClass={enemyHeroTarget?"target-enemy":""} onTarget={enemyHeroTarget?()=>applyTarget("enemy-hero"):undefined}', '<PlayerHero player={foe} enemy targetClass={engineTargetIds.includes("enemy-hero")?"target-enemy":enemyHeroTarget?"target-enemy":""} onTarget={engineTargetIds.includes("enemy-hero")?()=>selectEngineTarget("enemy-hero"):enemyHeroTarget?()=>applyTarget("enemy-hero"):undefined}');
  source = source.replace('<PlayerHero player={me} onLevel={levelUp} canEvolveThisTurn={game.active===0} targetClass={allyHeroTarget?"target-ally":""} onTarget={allyHeroTarget?()=>applyTarget("ally-hero"):undefined}', '<PlayerHero player={me} onLevel={levelUp} canEvolveThisTurn={game.active===0} targetClass={engineTargetIds.includes("ally-hero")?"target-ally":allyHeroTarget?"target-ally":""} onTarget={engineTargetIds.includes("ally-hero")?()=>selectEngineTarget("ally-hero"):allyHeroTarget?()=>applyTarget("ally-hero"):undefined}');

  source = source.replace('<TerrainSlot card={foe.terrain} enemy targetClass={enemyPermanentTarget?"target-enemy":""} onTarget={enemyPermanentTarget&&foe.terrain?()=>applyTarget(foe.terrain!.uid):undefined}/>', '<TerrainSlot card={foe.terrain} enemy targetClass={foe.terrain&&engineTargetIds.includes(foe.terrain.uid)?"target-enemy":enemyPermanentTarget?"target-enemy":""} onTarget={foe.terrain&&engineTargetIds.includes(foe.terrain.uid)?()=>selectEngineTarget(foe.terrain!.uid):enemyPermanentTarget&&foe.terrain?()=>applyTarget(foe.terrain!.uid):undefined}/>');
  source = source.replace('<TerrainSlot card={me.terrain} drop=', '<TerrainSlot card={me.terrain} targetClass={me.terrain&&engineTargetIds.includes(me.terrain.uid)?"target-ally":allyPermanentTarget?"target-ally":""} onTarget={me.terrain&&engineTargetIds.includes(me.terrain.uid)?()=>selectEngineTarget(me.terrain!.uid):allyPermanentTarget&&me.terrain?()=>applyTarget(me.terrain!.uid):undefined} drop=');
  source = source.replace(' targetClass={allyPermanentTarget?"target-ally":""} onTarget={allyPermanentTarget&&me.terrain?()=>applyTarget(me.terrain!.uid):undefined}/><BattlefieldRows', '/><BattlefieldRows');

  if (!source.includes('ruleTargetIds?:string[]')) {
    source = source.replace('targetableCreatureIds,supportTargetClass="",selectedAttacker,onCreature,onCreatureDrop,onSupportDrop,onActivateSupport,onActivateCreature,onSupportTarget,activationEnabled=false,combatActive=false}:{player:Player;enemy?:boolean;drop?:boolean;dragged?:{index:number;type:CardType}|null;allyTarget?:boolean;enemyTarget?:boolean;targetableCreatureIds?:string[];supportTargetClass?:string;selectedAttacker?:string;onCreature?:(uid:string)=>void;', 'targetableCreatureIds,ruleTargetIds,supportTargetClass="",selectedAttacker,onCreature,onRuleTarget,onCreatureDrop,onSupportDrop,onActivateSupport,onActivateCreature,onSupportTarget,activationEnabled=false,combatActive=false}:{player:Player;enemy?:boolean;drop?:boolean;dragged?:{index:number;type:CardType}|null;allyTarget?:boolean;enemyTarget?:boolean;targetableCreatureIds?:string[];ruleTargetIds?:string[];supportTargetClass?:string;selectedAttacker?:string;onCreature?:(uid:string)=>void;onRuleTarget?:(uid:string)=>void;');
    source = source.replace('canAttackNow=!!creature&&combatActive&&!enemy&&!creature.exhausted', 'creatureRuleTarget=!!creature&&!!ruleTargetIds?.includes(creature.uid),supportRuleTarget=!!support&&!!ruleTargetIds?.includes(support.uid),canAttackNow=!!creature&&combatActive&&!enemy&&!creature.exhausted');
    source = source.replace('targetClass={`${allyTarget&&(!targetableCreatureIds||targetableCreatureIds.includes(creature.uid))?"target-ally":enemyTarget?"target-enemy":""}', 'targetClass={`${creatureRuleTarget?(enemy?"target-enemy":"target-ally"):allyTarget&&(!targetableCreatureIds||targetableCreatureIds.includes(creature.uid))?"target-ally":enemyTarget?"target-enemy":""}');
    source = source.replace('onClick={onCreature?()=>onCreature(creature.uid):undefined}', 'onClick={creatureRuleTarget&&onRuleTarget?()=>onRuleTarget(creature.uid):onCreature?()=>onCreature(creature.uid):undefined}');
    source = source.replace('targetClass={supportTargetClass} onClick={onSupportTarget?()=>onSupportTarget(support.uid):undefined}', 'targetClass={supportRuleTarget?(enemy?"target-enemy":"target-ally"):supportTargetClass} onClick={supportRuleTarget&&onRuleTarget?()=>onRuleTarget(support.uid):onSupportTarget?()=>onSupportTarget(support.uid):undefined}');
  }

  source = source.replace('<BattlefieldRows player={foe} enemy enemyTarget={enemyTarget}', '<BattlefieldRows player={foe} enemy ruleTargetIds={engineTargetIds} onRuleTarget={engineTargetDecision?selectEngineTarget:undefined} enemyTarget={enemyTarget}');
  source = source.replace('<BattlefieldRows player={me} drop=', '<BattlefieldRows player={me} ruleTargetIds={engineTargetIds} onRuleTarget={engineTargetDecision?selectEngineTarget:undefined} drop=');

  source = source.replace('{decisionForLocal&&<div className="engine-decision-backdrop"><section className="engine-decision-panel">', '{decisionForLocal&&<div className={`engine-decision-backdrop ${engineTargetDecision?"engine-target-decision-backdrop":""}`}><section className={`engine-decision-panel ${engineTargetDecision?"engine-target-decision-panel":""}`} data-decision-kind={engineDecision.kind}>');
  source = source.replace('engineDecision.kind==="targets"?`Escolha o alvo de ${engineDecision.sourceName||"Primeiro Ato"}`', 'engineTargetDecision?`Escolha o alvo de ${engineDecision.sourceName||"Primeiro Ato"}`');
  source = source.replace('engineDecision.kind==="targets"?<div className="visual-card-choice-grid">{engineTargetOptions.map(option=><div className="visual-card-choice" key={option.id}><OriginalCard card={option.card} small onClick={()=>selectEngineTarget(option.id)}/><span>{option.label}</span></div>)}</div>:', 'engineTargetDecision?<div className="engine-target-instruction"><b>{engineDecision.sourceName||"Efeito de carta"}</b><span>{engineTargetConsequence}</span><em>Escolha diretamente uma das cartas destacadas no campo.</em></div>:');

  await write(path, source);
}

// CSS import is appended once; the dedicated file owns target-decision geometry.
{
  const path = "app/lab.css";
  let source = await read(path);
  if (!source.includes('rules-interaction-v2.css')) source = `@import "./rules-interaction-v2.css";\n${source}`;
  await write(path, source);
}

console.log("Card semantics v2 patch applied successfully.");
