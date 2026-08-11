import { applyEffect, defaultEffectHandlers, RulesViolation } from "./effects.mjs";
import { hasSubtype } from "./subtypes.mjs";
import { isValidTarget, targetPolicy, TargetScope } from "./targeting.mjs";

export class RulesLoopError extends Error {
  constructor(message, trace) { super(message); this.name = "RulesLoopError"; this.trace = trace; }
}

const INTERACTIVE_EFFECTS = new Set(["forceAttack", "replayTopGraveAbility", "search", "replayAbility", "additionalTargetCost", "optionalRedirect", "optionalDrawFrom", "removeMarkersFromConstants"]);
export function canExecuteCard(card, handlers = defaultEffectHandlers) {
  if (!handlers || typeof handlers !== "object") handlers = defaultEffectHandlers;
  const inspect = (effects = []) => effects.every((effect) => !!handlers[effect.type] && effect.type !== "unsupported" && !INTERACTIVE_EFFECTS.has(effect.type) && inspect(effect.effects) && (effect.branches || []).every((branch) => inspect(branch.effects)) && (effect.choices || []).every(inspect));
  return (card?.abilities || []).every((ability) => inspect(ability.effects));
}

const clone = (value) => structuredClone(value);
const fingerprint = (state, stack) => JSON.stringify({ active: state.active, phase: state.phase, round: state.round, pendingAction: state.pendingAction?.type || null, players: state.players.map((p) => ({ life: p.life, energy: p.energy, reserve: p.reserve, hand: p.hand.length, deck: p.deck.length, board: p.board.map((u) => [u.uid, u.damage, u.exhausted, u.markers]) })), stack: stack.map((item) => [item.kind, item.effect?.type, item.event?.type]) });

export function validateCosts(state, ability, context) {
  const entry = state.players[context.owner];
  for (const cost of ability.costs || []) {
    if (cost.type === "tap") { const source = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].find((unit) => unit.uid === context.sourceId); if (!source || source.exhausted || source.summoning || source.enteredRound === state.round) throw new RulesViolation("cannot-tap"); }
    if (cost.type === "removeMarkers") { const source = [...entry.board, ...entry.support].find((unit) => unit.uid === context.sourceId); const available = typeof source?.markers === "number" ? source.markers : Object.values(source?.markers || {}).reduce((sum, value) => sum + Number(value), 0); if (cost.amount !== "X" && available < cost.amount) throw new RulesViolation("not-enough-markers"); }
    if (cost.type === "sacrifice") { const ids = [...new Set(context.sacrificeIds || [])]; if (ids.length < cost.amount || ids.some((id) => !entry.board.some((unit) => unit.uid === id))) throw new RulesViolation("sacrifice-required"); }
    if (cost.type === "energy") { const source = permanentUnits(entry).find((unit) => unit.uid === context.sourceId); const available = entry.energy + (source?.type !== "Criatura" ? entry.reserve : 0); if (available < cost.amount) throw new RulesViolation("not-enough-energy"); }
    if (cost.type === "life" && entry.life <= cost.amount) throw new RulesViolation("not-enough-life");
    if (cost.type === "removeMarkersFromConstants") { const available = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].reduce((sum, card) => sum + (typeof card.markers === "number" ? card.markers : Object.values(card.markers || {}).reduce((total, value) => total + Number(value), 0)), 0); if (available < cost.amount) throw new RulesViolation("not-enough-markers"); }
  }
}

function payCosts(state, ability, context) {
  const entry = state.players[context.owner];
  for (const cost of ability.costs || []) {
    if (cost.type === "tap") applyEffect(state, { type: "tap" }, context);
    if (cost.type === "sacrifice") applyEffect(state, { type: "sacrifice" }, context);
    if (cost.type === "energy") { const source = permanentUnits(entry).find((unit) => unit.uid === context.sourceId); const fromEnergy = Math.min(entry.energy, cost.amount); entry.energy -= fromEnergy; const fromReserve = source?.type !== "Criatura" ? cost.amount - fromEnergy : 0; entry.reserve -= fromReserve; }
    if (cost.type === "life") entry.life -= cost.amount;
    if (cost.type === "removeMarkers") {
      const source = [...entry.board, ...entry.support].find((unit) => unit.uid === context.sourceId); let remaining = cost.amount === "X" ? context.markerAmount || 0 : cost.amount;
      if (typeof source.markers === "number") source.markers -= Math.min(source.markers, remaining); else for (const key of Object.keys(source.markers || {})) { const used = Math.min(source.markers[key], remaining); source.markers[key] -= used; remaining -= used; if (!remaining) break; }
    }
    if (cost.type === "removeMarkersFromConstants") {
      let remaining = cost.amount; for (const source of [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])]) { if (!remaining) break; if (typeof source.markers === "number") { const used = Math.min(source.markers, remaining); source.markers -= used; remaining -= used; } else for (const key of Object.keys(source.markers || {})) { const used = Math.min(source.markers[key], remaining); source.markers[key] -= used; remaining -= used; if (!remaining) break; } }
    }
  }
}

function modifierApplies(state, owner, modifier) { return modifier.condition !== "controllerTurn" || state.active === owner; }
function activeKeywords(unit) { return unit?.suffocated ? [] : [...(unit?.tags || []), ...(unit?.temporaryTags || []), ...(unit?.grantedKeywords || [])]; }
function hasKeyword(unit, pattern) { return activeKeywords(unit).some((tag) => pattern.test(String(tag))); }
function attackPermissionMet(unit) {
  const requirement = unit?.attackPermission?.requiresMarkers;
  if (!requirement) return true;
  const available = typeof unit.markers === "number" ? unit.markers : unit.markers?.[requirement.marker] || 0;
  return available >= requirement.minimum;
}
function defenderCapacity(unit) {
  if (unit?.suffocated) return 1;
  const rulesText = [...activeKeywords(unit), unit?.text || ""].join(" ");
  const match = rulesText.match(/defensor\s*(\d+)/i);
  return Math.max(1, Number(match?.[1] || 1));
}
function adjacentSupportBonus(state, unit, owner) {
  const entry = state.players[owner]; let attack = 0; let health = 0;
  for (const source of permanentUnits(entry)) {
    if (source === unit || source.suffocated || Math.abs((source.slot ?? -10) - (unit.slot ?? 10)) !== 1) continue;
    const rulesText = [...activeKeywords(source), source.text || ""].join(" ");
    if (!/\bsuporte\b/i.test(rulesText)) continue;
    const match = rulesText.match(/suporte\s*:?\s*([+-]?\d+)\s*\/\s*([+-]?\d+)/i);
    if (match) { attack += Number(match[1]); health += Number(match[2]); }
  }
  return { attack, health };
}
function baseAttack(state, unit, owner) { const support = adjacentSupportBonus(state, unit, owner); return Math.max(0, (unit?.atk || 0) + support.attack + (unit?.modifiers || []).filter((value) => modifierApplies(state, owner, value)).reduce((sum, value) => sum + (value.attack || 0), 0)); }
function effectiveAttack(state, unit, owner) {
  if (unit?.frozen || hasKeyword(unit, /congelado/i)) return 0;
  if (unit?.dynamicStats?.bothFromAttack) { const strongest = state.players[owner].board.filter((candidate) => candidate !== unit).reduce((best, candidate) => Math.max(best, baseAttack(state, candidate, owner)), 0); return strongest; }
  return baseAttack(state, unit, owner);
}
function effectiveHealth(state, unit, owner) {
  if (unit?.dynamicStats?.bothFromAttack) { const strongest = state.players[owner].board.filter((candidate) => candidate !== unit).reduce((best, candidate) => Math.max(best, baseAttack(state, candidate, owner)), 0); return Math.max(1, strongest); }
  const support = adjacentSupportBonus(state, unit, owner);
  return Math.max(1, (unit?.hp || 1) + support.health + (unit?.modifiers || []).filter((value) => modifierApplies(state, owner, value)).reduce((sum, value) => sum + (value.health || 0), 0));
}
function dealCombatDamage(state, target, targetOwner, source, sourceOwner, amount) {
  const shield = (target.damageShields || []).find((item) => item.uses > 0);
  if (shield) { shield.uses--; target.damageShields = target.damageShields.filter((item) => item.uses > 0); return 0; }
  const dealt = Math.max(0, amount - (hasKeyword(target, /robusto/i) ? 1 : 0));
  target.damage = (target.damage || 0) + dealt;
  if (dealt > 0 && hasKeyword(source, /toque da morte/i)) target.damage = Math.max(target.damage, effectiveHealth(state, target, targetOwner));
  if (dealt > 0 && hasKeyword(source, /roubo de vida/i)) { const entry = state.players[sourceOwner]; entry.life = Math.min(entry.maxLife ?? 30, entry.life + dealt); }
  return dealt;
}
function subtype(card, value) { return hasSubtype(card, value) || (card.tags || []).some((tag) => String(tag).toLowerCase() === String(value).toLowerCase()); }
function conditionMatches(state, source, owner, condition, event = {}) {
  if (!condition) return true;
  if (condition.cardsPlayedBeforeThisAtLeast != null && (state.players[owner].turnCardsPlayed || 0) < condition.cardsPlayedBeforeThisAtLeast) return false;
  if (condition.controllerTurn && state.active !== owner) return false;
  if (condition.all) return condition.all.every((item) => conditionMatches(state, source, owner, item, event));
  const eventCard = event.card || state.players.flatMap((entry) => [...entry.board, ...entry.support, ...entry.grave]).find((card) => card.uid === event.cardId || card.id === event.cardId);
  if (condition.eventCardSubtype && !subtype(eventCard || {}, condition.eventCardSubtype)) return false;
  if (condition.eventCardType && eventCard?.type !== condition.eventCardType) return false;
  if (condition.eventCardTypeNot && (eventCard?.type === condition.eventCardTypeNot || eventCard?.imageCard)) return false;
  if (condition.spellElement && !(event.card?.tags || eventCard?.tags || []).includes(condition.spellElement)) return false;
  if (condition.sourceSubtype && !subtype(event.source || {}, condition.sourceSubtype)) return false;
  if (condition.controllerSubtypeEnteredThisTurn && (state.players[owner].subtypesEnteredThisTurn?.[condition.controllerSubtypeEnteredThisTurn.subtype] || 0) !== condition.controllerSubtypeEnteredThisTurn.count) return false;
  if (condition.activePlayerControlsVanillaCreature && !state.players[state.active].board.some((card) => !(card.text || "").trim())) return false;
  if (condition.wasOnlySubtypeInAllFields && state.players.flatMap((entry) => entry.board).filter((card) => subtype(card, condition.wasOnlySubtypeInAllFields)).length > 0) return false;
  if (condition.sourceSurvived && !permanentUnits(state.players[owner]).some((card) => card.uid === source.uid || card.id === source.id)) return false;
  if (condition.spellNameIncludes && !String(event.card?.name || eventCard?.name || "").toLowerCase().includes(String(condition.spellNameIncludes).toLowerCase())) return false;
  if (condition.nameIncludes && !String(event.card?.name || event.effectSource?.name || "").toLowerCase().includes(String(condition.nameIncludes).toLowerCase())) return false;
  if (condition.eventOwnerIsController && event.owner !== owner) return false;
  if (condition.otherThanSource && (event.sourceId === source.uid || event.cardId === source.uid || event.cardId === source.id)) return false;
  if (condition.eventTargetType) { const targets = (event.targetIds || []).map((id) => state.players.flatMap((entry) => permanentUnits(entry)).find((card) => card.uid === id || card.id === id)).filter(Boolean); if (!targets.some((target) => target.type === condition.eventTargetType)) return false; }
  return true;
}

function playConditionMatches(state, owner, condition) {
  if (!condition) return true;
  if (condition.alliedPermanentHasTrigger) return permanentUnits(state.players[owner]).some((card) => (card.abilities || []).some((ability) => {
    if (ability.trigger !== condition.alliedPermanentHasTrigger) return false;
    const steps = abilityTargetSteps(ability);
    return !steps.length || canSatisfyTargetSteps(state, owner, steps);
  }));
  return true;
}
function availabilityMatches(state, source, owner, availability) {
  if (!availability) return true;
  if (availability.topGraveHasTrigger) { const top = state.players[owner].grave.at(-1); return !!top && (top.abilities || []).some((ability) => ability.trigger === availability.topGraveHasTrigger); }
  if (availability.whileDefending && (state.phase !== "combate" || !(source.defenseUses > 0))) return false;
  return true;
}
function eventAppliesToSource(event, source, owner) {
  const sourceId = source.uid || source.id;
  if (["onEnter", "onDestroyed", "onAttack", "onCombatKill"].includes(event.type)) return sourceId === event.sourceId;
  if (event.type === "onDamageTaken") return sourceId === event.targetId;
  if (event.type === "onTargetedBySpell") return (event.targetIds || []).includes(sourceId);
  if (event.type === "onAttachedCreatureDamage" || event.type === "onAttachedCreatureTargeted") return source.attachedTo === event.sourceId || (event.targetIds || []).includes(source.attachedTo);
  if (event.type === "onOpponentSpellAttempt") return event.owner !== owner;
  if (event.type === "onSpellCast") return event.owner === owner;
  return true;
}

function usageKey(source, ability) { return `${source.uid || source.id}:${ability.id}`; }
function usageAvailable(state, source, owner, ability) { if (!ability.usageLimit && !ability.condition?.firstEachTurn) return true; return !(state.players[owner].abilityUses || {})[usageKey(source, ability)]; }
function claimUsage(state, source, owner, ability) { if (!ability.usageLimit && !ability.condition?.firstEachTurn) return; state.players[owner].abilityUses ||= {}; state.players[owner].abilityUses[usageKey(source, ability)] = (state.players[owner].abilityUses[usageKey(source, ability)] || 0) + 1; }

const permanentUnits = (entry) => [...(entry.board || []), ...(entry.support || []), ...(entry.terrain ? [entry.terrain] : [])];
const unitOwner = (state, id) => state.players.findIndex((entry) => permanentUnits(entry).some((unit) => unit.uid === id || unit.id === id));
const targetScope = (value) => ({ anyCharacter: TargetScope.ANY_CHARACTER, anyCreature: TargetScope.ANY_CREATURE, allyCreature: TargetScope.ALLY_CREATURE, enemyCreature: TargetScope.ENEMY_CREATURE, anyPermanent: TargetScope.ANY_PERMANENT, allyPermanent: TargetScope.ALLY_PERMANENT, enemyPermanent: TargetScope.ENEMY_PERMANENT, anotherAllyPermanent: TargetScope.ALLY_PERMANENT, creature: TargetScope.ANY_CREATURE }[value] || TargetScope.NONE);
function abilityTargetSteps(ability) {
  if (ability.sourceText) return (targetPolicy(ability.sourceText).steps || []).filter((step) => step.role !== "sacrifice");
  return (ability.effects || []).flatMap((effect) => { const scope = targetScope(effect.target); return Array.from({ length: effect.selections ?? (scope === TargetScope.NONE ? 0 : 1) }, () => ({ scope, role: "effect" })); }).filter((step) => step.scope !== TargetScope.NONE);
}
function targetCandidates(state, owner, step) {
  const result = [];
  state.players.forEach((entry, targetOwner) => {
    for (const target of permanentUnits(entry)) {
      const targetKind = entry.board.includes(target) || target.type === "Criatura" ? "creature" : "permanent";
      if (isValidTarget(step, owner, targetOwner, targetKind)) result.push(target.uid || target.id);
    }
    if (isValidTarget(step, owner, targetOwner, "hero")) result.push(targetOwner === owner ? "ally-hero" : "enemy-hero");
  });
  return result;
}
function canSatisfyTargetSteps(state, owner, steps) {
  const candidates = steps.map((step) => targetCandidates(state, owner, step));
  const choose = (index, used) => index >= candidates.length || candidates[index].some((id) => {
    if (used.has(id)) return false;
    const next = new Set(used); next.add(id);
    return choose(index + 1, next);
  });
  return choose(0, new Set());
}
function replayAbilityCandidates(state, owner, effect) {
  return (state.players[owner].board || []).filter((card) => (!effect.selector?.type || card.type === effect.selector.type) && (card.abilities || []).some((ability) => {
    if (ability.trigger !== effect.trigger) return false;
    const steps = abilityTargetSteps(ability);
    return !steps.length || canSatisfyTargetSteps(state, owner, steps);
  }));
}
function validateTargets(state, owner, abilities, command, source) {
  const targetIds = command.targetIds || []; const steps = abilities.flatMap(abilityTargetSteps); if (steps.length !== targetIds.length) { if (steps.length || targetIds.length) throw new RulesViolation("invalid-target-count"); return; }
  steps.forEach((step, index) => { const id = targetIds[index]; const hero = /^(?:ally|enemy|controller)-hero$|^hero-[01]$/.test(id || ""); const targetOwner = hero ? (id === "enemy-hero" ? 1 - owner : id === "ally-hero" || id === "controller-hero" ? owner : Number(id.slice(-1))) : unitOwner(state, id); const target = hero || targetOwner < 0 ? null : permanentUnits(state.players[targetOwner]).find((unit) => unit.uid === id || unit.id === id); const targetKind = hero ? "hero" : target && (target.type === "Criatura" || state.players[targetOwner].board.includes(target)) ? "creature" : "permanent"; if (targetOwner < 0 || (!hero && !target) || !isValidTarget(step, owner, targetOwner, targetKind) || (step.requireExhausted && (!target || !target.exhausted))) throw new RulesViolation("invalid-target"); const barrier = target && hasKeyword(target, /barreira m[aá]gica/i); if (barrier && !/ignora.*barreira m[aá]gica/i.test(source?.text || "")) throw new RulesViolation("magic-barrier"); });
}
function preflightPlay(state, command, handlers) {
  const entry = state.players[command.owner];
  const card = entry?.hand?.find((candidate) => candidate.id === command.cardId);
  if (!card) throw new RulesViolation("card-not-in-hand");
  if (!canExecuteCard(card, handlers)) throw new RulesViolation("card-not-migrated");
  const accelerated = (card.tags || []).some((tag) => /acelerado/i.test(tag)) || /acelerado/i.test(card.text || "");
  if (state.active !== command.owner && !(accelerated && command.hasPriority)) throw new RulesViolation("not-your-priority");
  if (state.phase !== "principal" && !(accelerated && command.hasPriority)) throw new RulesViolation("wrong-phase");
  const playAbilities = (card.abilities || []).filter((ability) => ability.trigger === "onPlay" && conditionMatches(state, card, command.owner, ability.condition, { card }));
  const enterAbilities = (card.abilities || []).filter((ability) => ability.trigger === "onEnter" && conditionMatches(state, card, command.owner, ability.condition, { card }));
  if (playAbilities.some((ability) => !playConditionMatches(state, command.owner, ability.playCondition) || ability.effects.some((effect) => effect.type === "replaySelectedAbility" && !replayAbilityCandidates(state, command.owner, effect).length))) throw new RulesViolation("play-condition-not-met");
  if (card.type !== "Criatura" || (command.targetIds || []).length) validateTargets(state, command.owner, card.type === "Criatura" ? enterAbilities : playAbilities, command, card);
  for (const ability of playAbilities) validateCosts(state, ability, command);
  const staticDiscount = permanentUnits(entry).flatMap((source) => source.staticModifiers || []).filter((modifier) => modifier.type === "costModifier" && (!modifier.selector?.type || modifier.selector.type === card.type) && (!modifier.during || modifier.during !== "controllerTurn" || state.active === command.owner)).reduce((sum, modifier) => sum + (modifier.amount || 0), 0);
  const cost = Math.max(0, (card.cost || 0) + (card.costModifier || 0) + staticDiscount);
  if (entry.energy + (card.type !== "Criatura" ? entry.reserve : 0) < cost) throw new RulesViolation("not-enough-energy");
  if (card.type === "Criatura") {
    if (!Number.isInteger(command.slot) || command.slot < 0 || command.slot > 4) throw new RulesViolation("invalid-creature-slot");
    const occupied = entry.board.find((unit) => unit.slot === command.slot);
    if ((occupied && entry.board.length < 5) || (!occupied && entry.board.length >= 5)) throw new RulesViolation("creature-zone-full");
  } else if (card.type === "Artefato" || card.type === "Encanto") {
    if (!Number.isInteger(command.slot) || command.slot < 0 || command.slot > 4 || entry.support.some((unit) => unit.slot === command.slot) || entry.support.length >= 5) throw new RulesViolation("support-zone-full");
    if (card.type === "Artefato" && card.page !== 304) {
      const host = entry.board.find((unit) => unit.uid === command.attachedTo);
      if (!host || host.slot !== command.slot || entry.support.some((unit) => unit.attachedTo === host.uid)) throw new RulesViolation("artifact-target-required");
    }
  }
  return { card, playAbilities, enterAbilities, cost };
}
function cleanupLethal(state, stack) {
  state.players.forEach((entry, owner) => { for (const unit of [...entry.board]) { const modifiers = (unit.modifiers || []).filter((item) => modifierApplies(state, owner, item)).reduce((sum, item) => sum + (item.health || 0), 0); const indestructible = hasKeyword(unit, /indestrut[ií]vel/i); if ((unit.damage || 0) < (unit.hp || 1) + modifiers || indestructible) continue; entry.board.splice(entry.board.indexOf(unit), 1); const attachments = entry.support.filter((card) => card.attachedTo === unit.uid); entry.support = entry.support.filter((card) => card.attachedTo !== unit.uid); for (const attachment of attachments) { if (attachment.generatedImage || attachment.imageCard) continue; if (attachment.page === 154) entry.obscuro.push(attachment); else entry.grave.push(attachment); } if (!unit.generatedImage && !unit.imageCard) entry.grave.push({ ...unit, deathCause: "effect" }); if (!unit.suppressDeathTrigger && !unit.generatedImage && !unit.imageCard) stack.push({ kind: "event", event: { type: "onDestroyed", owner, sourceId: unit.uid, cardId: unit.uid, card: unit, deathCause: "effect" } }); stack.push({ kind: "event", event: { type: "onCreatureDestroyed", owner, cardId: unit.uid, card: unit } }); } });
}

function activeAbilities(state, event) {
  const result = [];
  if (["onDestroyed", "onPermanentLeaves", "onCreatureEnter"].includes(event.type) && event.card && subtype(event.card, "Recruta")) state.players.forEach((entry, owner) => {
    for (const source of permanentUnits(entry)) {
      const modifiers = source.staticModifiers || [];
      const active = event.owner === owner && (((event.type === "onDestroyed" || event.type === "onPermanentLeaves") && modifiers.some((modifier) => modifier.type === "recruitFirstActOnLeave")) || (event.type === "onCreatureEnter" && event.sourceId !== source.uid && modifiers.some((modifier) => modifier.type === "doubleRecruitFirstAct")));
      if (active) { const effects = (event.card.abilities || []).filter((ability) => ability.trigger === "onEnter").flatMap((ability) => ability.effects || []); if (effects.length) result.push({ source, owner, ability: { id: `${source.uid}-recruit-passive`, effects, replaySourceId: event.card.uid || event.card.id } }); }
    }
  });
  if ((event.type === "onDestroyed" || event.type === "onPermanentLeaves") && event.card && !event.card.suffocated) for (const ability of event.card.abilities || []) if (ability.trigger === event.type && conditionMatches(state, event.card, event.owner, ability.condition, event) && usageAvailable(state, event.card, event.owner, ability)) result.push({ source: event.card, owner: event.owner, ability });
  state.players.forEach((entry, owner) => {
      for (const source of permanentUnits(entry)) {
      if (source.suffocated) continue;
      for (const ability of source.abilities || []) if (ability.trigger === event.type && eventAppliesToSource(event, source, owner) && conditionMatches(state, source, owner, ability.condition, event) && usageAvailable(state, source, owner, ability)) result.push({ source, owner, ability });
    }
  });
  return result.sort((a, b) => a.owner - b.owner || (a.source.slot ?? 99) - (b.source.slot ?? 99) || String(a.ability.id).localeCompare(String(b.ability.id)));
}

export function executeCommand(inputState, command, options = {}) {
  const state = clone(inputState); const maxSteps = options.maxSteps ?? 512; const maxRepeats = options.maxRepeats ?? 4; const handlers = { ...defaultEffectHandlers, ...(options.handlers || {}) }; let actionLabel = command.type;
  const stack = [{ kind: "command", command }]; const trace = []; const repeats = new Map(); let steps = 0;
  while (stack.length) {
    if (++steps > maxSteps) throw new RulesLoopError(`Resolution exceeded ${maxSteps} steps`, trace);
    const key = fingerprint(state, stack); const count = (repeats.get(key) || 0) + 1; repeats.set(key, count); if (count > maxRepeats) throw new RulesLoopError("Repeated resolution state detected", trace);
    const item = stack.pop(); trace.push({ step: steps, kind: item.kind, type: item.command?.type || item.effect?.type || item.event?.type });
    if (item.kind === "command") {
      if (item.command.type === "passPriority") {
        const pending = state.pendingResponse;
        if (!pending || pending.responder !== item.command.owner) throw new RulesViolation("not-your-priority");
        if ((pending.passes || 0) === 0) state.pendingResponse = { ...pending, responder: pending.actor, passes: 1 };
        else {
          const original = state.pendingAction;
          state.pendingResponse = null; delete state.pendingAction;
          if (original) stack.push({ kind: "command", command: { ...original, skipPriority: true } });
        }
      } else if (options.priority && ["attack", "activate"].includes(item.command.type) && !item.command.skipPriority && !item.command.hasPriority) {
        if (state.pendingAction) throw new RulesViolation("priority-window-open");
        state.pendingAction = { ...item.command }; state.pendingResponse = { responder: 1 - item.command.owner, actor: item.command.owner, action: item.command.type, passes: 0 }; continue;
      } else if (item.command.type === "playCard") {
        if (options.priority && !item.command.skipPriority && !item.command.hasPriority) {
          if (state.pendingAction) throw new RulesViolation("priority-window-open");
          /* A priority window is only created for an already legal intent.
             Otherwise an invalid card could remain in pendingAction forever
             after the responder passes. */
          preflightPlay(state, item.command, handlers);
          state.pendingAction = { ...item.command };
          state.pendingResponse = { responder: 1 - item.command.owner, actor: item.command.owner, action: state.players[item.command.owner].hand.find((card) => card.id === item.command.cardId)?.name || item.command.cardId, passes: 0 };
          continue;
        }
        if (state.pendingAction && item.command.owner !== state.pendingResponse?.responder) throw new RulesViolation("not-your-priority");
        const entry = state.players[item.command.owner];
        const cardIndex = entry.hand.findIndex((card) => card.id === item.command.cardId);
        const card = entry.hand[cardIndex]; if (!card) throw new RulesViolation("card-not-in-hand"); actionLabel = card.name || card.id;
        if (!canExecuteCard(card, handlers)) throw new RulesViolation("card-not-migrated");
        const accelerated = (card.tags || []).some((tag) => /acelerado/i.test(tag)) || /acelerado/i.test(card.text || "");
        if (state.active !== item.command.owner && !(accelerated && item.command.hasPriority)) throw new RulesViolation("not-your-priority");
        if (state.phase !== "principal" && !(accelerated && item.command.hasPriority)) throw new RulesViolation("wrong-phase");
        const playAbilities = (card.abilities || []).filter((ability) => ability.trigger === "onPlay" && conditionMatches(state, card, item.command.owner, ability.condition, { card })); if (playAbilities.some((ability) => !playConditionMatches(state, item.command.owner, ability.playCondition) || ability.effects.some((effect) => effect.type === "replaySelectedAbility" && !replayAbilityCandidates(state, item.command.owner, effect).length))) throw new RulesViolation("play-condition-not-met"); const enterAbilities = (card.abilities || []).filter((ability) => ability.trigger === "onEnter" && conditionMatches(state, card, item.command.owner, ability.condition, { card }));
        if (card.type !== "Criatura" || (item.command.targetIds || []).length) validateTargets(state, item.command.owner, card.type === "Criatura" ? enterAbilities : playAbilities, item.command, card);
        for (const ability of playAbilities) validateCosts(state, ability, item.command);
        const staticDiscount = permanentUnits(entry).flatMap((source) => source.staticModifiers || []).filter((modifier) => modifier.type === "costModifier" && (!modifier.selector?.type || modifier.selector.type === card.type) && (!modifier.during || modifier.during !== "controllerTurn" || state.active === item.command.owner)).reduce((sum, modifier) => sum + (modifier.amount || 0), 0);
        const cost = Math.max(0, (card.cost || 0) + (card.costModifier || 0) + staticDiscount); const spell = card.type === "Feitiço"; const canUseReserve = card.type !== "Criatura";
        if (entry.energy + (canUseReserve ? entry.reserve : 0) < cost) throw new RulesViolation("not-enough-energy");
        for (const ability of playAbilities) payCosts(state, ability, item.command);
        const fromEnergy = Math.min(entry.energy, cost); entry.energy -= fromEnergy; const fromReserve = canUseReserve ? cost - fromEnergy : 0; entry.reserve -= fromReserve;
        entry.hand.splice(cardIndex, 1); for (const source of permanentUnits(entry)) if (typeof source.cardsPlayedAfterSelf === "number") source.cardsPlayedAfterSelf++; entry.cardsPlayed = (entry.cardsPlayed || 0) + 1; entry.turnCardsPlayed = (entry.turnCardsPlayed || 0) + 1; if (spell) { entry.spellsPlayed = (entry.spellsPlayed || 0) + 1; entry.turnSpellsPlayed = (entry.turnSpellsPlayed || 0) + 1; } const permanent = card.type !== "Feitiço" || card.abilities?.some((ability) => ability.effects?.some((effect) => effect.type === "remainUntilTurnEnd"));
        if (permanent) {
          state.nextInstanceId = (state.nextInstanceId || 0) + 1;
          const unit = { ...card, uid: item.command.instanceId || `${card.id}-${state.round}-${state.nextInstanceId}`, slot: item.command.slot ?? 0, enteredRound: state.round, attackedThisTurn: false, damage: 0, bonusAtk: 0, bonusHp: 0, exhausted: false, summoning: card.type === "Criatura" && !(card.tags || []).some((tag) => /investida/i.test(String(tag))), frozen: false, stunned: false, suffocated: false, immobilized: false, defenseUses: 0, markers: card.markers ?? 0, modifiers: [] };
          if (card.type === "Criatura") { const replaced = entry.board.find((existing) => existing.slot === unit.slot); if ((replaced && entry.board.length < 5) || (!replaced && entry.board.length >= 5)) throw new RulesViolation("creature-zone-full"); if (replaced) { entry.board = entry.board.filter((existing) => existing !== replaced); const attachments = entry.support.filter((attachment) => attachment.attachedTo === replaced.uid); entry.support = entry.support.filter((attachment) => attachment.attachedTo !== replaced.uid); for (const attachment of attachments) { if (attachment.generatedImage || attachment.imageCard) continue; if (attachment.page === 154) entry.obscuro.push(attachment); else entry.grave.push({ ...attachment, deathCause: "replaced" }); } if (!replaced.generatedImage && !replaced.imageCard) entry.obscuro.push({ ...replaced, lastZone: "board", deathCause: "replaced" }); stack.push({ kind: "event", event: { type: "onPermanentLeaves", owner: item.command.owner, sourceId: replaced.uid, cardId: replaced.uid, card: replaced, zone: "board" } }); } entry.board.push(unit); entry.subtypesEnteredThisTurn ||= {}; for (const value of new Set([...(card.subtypes || []), ...(card.tags || [])])) entry.subtypesEnteredThisTurn[value] = (entry.subtypesEnteredThisTurn[value] || 0) + 1; stack.push({ kind: "event", event: { type: "onCreatureEnter", owner: item.command.owner, sourceId: unit.uid, cardId: unit.uid, card: unit } }); }
          else if (card.type === "Terreno") { if (entry.terrain && !entry.terrain.generatedImage) entry.grave.push(entry.terrain); entry.terrain = unit; }
          else { if (entry.support.length >= 5 || entry.support.some((existing) => existing.slot === unit.slot)) throw new RulesViolation("support-zone-full"); if (card.type === "Artefato") { const attached = entry.board.find((creature) => creature.uid === item.command.attachedTo); if (!attached && card.page !== 304) throw new RulesViolation("artifact-target-required"); if (attached) { if (entry.support.some((artifact) => artifact.attachedTo === attached.uid)) throw new RulesViolation("artifact-target-required"); unit.attachedTo = attached.uid; unit.slot = attached.slot; } } entry.support.push(unit); }
          const enter = (unit.abilities || []).filter((ability) => ability.trigger === "onEnter");
          const hasEnterTargets = (item.command.targetIds || []).length > 0;
          const enterEffectCanResolve = (effect) => hasEnterTargets || (targetScope(effect.target) === TargetScope.NONE && effect.relation !== "selectedTarget");
          for (const ability of enter.reverse()) for (const effect of [...ability.effects].filter(enterEffectCanResolve).reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: unit.uid, effectSource: unit } });
          const staticAbilities = (unit.abilities || []).filter((ability) => ability.trigger === "static");
          for (const ability of staticAbilities.reverse()) for (const effect of [...ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: unit.uid, effectSource: unit } });
        } else entry.grave.push(card);
        for (const ability of playAbilities.reverse()) for (const effect of [...ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: card.id, effectSource: card } });
        stack.push({ kind: "event", event: { type: spell ? "onSpellCast" : "onCardPlayed", owner: item.command.owner, cardId: card.id, card } });
      } else if (item.command.type === "attack") {
        if (state.active !== item.command.owner || state.phase !== "combate") throw new RulesViolation("wrong-combat-priority");
        const attackerOwner = item.command.owner; const defenderOwner = 1 - attackerOwner;
        const attackerPlayer = state.players[attackerOwner]; const defenderPlayer = state.players[defenderOwner];
        const attacker = attackerPlayer.board.find((unit) => unit.uid === item.command.attackerId);
        const attacksUsed = attacker?.attacksThisTurn ?? (attacker?.attackedThisTurn ? 1 : 0); if (!attacker || attacker.exhausted || attacksUsed >= (attacker.attackLimit || 1) || attacker.summoning || attacker.stunned || hasKeyword(attacker, /atordoado/i)) throw new RulesViolation("invalid-attacker"); if (!attackPermissionMet(attacker)) throw new RulesViolation("attack-requirement-not-met");
        actionLabel = attacker.name || attacker.uid;
        attacker.attacksThisTurn = attacksUsed + 1; attacker.attackedThisTurn = attacker.attacksThisTurn >= (attacker.attackLimit || 1);
        if (!hasKeyword(attacker, /alerta/i) && attacker.attackedThisTurn) attacker.exhausted = true;
        const attack = effectiveAttack(state, attacker, attackerOwner);
        const defender = defenderPlayer.board.find((unit) => unit.uid === item.command.defenderId);
        let damageDealtByAttacker = 0;
        if (!defender) {
          damageDealtByAttacker = attack;
          defenderPlayer.life -= attack;
          if (attack > 0 && hasKeyword(attacker, /roubo de vida/i)) attackerPlayer.life = Math.min(attackerPlayer.maxLife ?? 30, attackerPlayer.life + attack);
        } else {
          const combatBlocked = (attacker.combatRestrictions || []).some((rule) => rule.cannotCombatSubtype && hasSubtype(defender, rule.cannotCombatSubtype)) || (defender.combatRestrictions || []).some((rule) => rule.cannotCombatSubtype && hasSubtype(attacker, rule.cannotCombatSubtype)); if (defender.exhausted || defender.stunned || defender.cannotDefend || combatBlocked || hasKeyword(defender, /atordoado/i) || (defender.defenseUses || 0) >= defenderCapacity(defender)) throw new RulesViolation("invalid-defender");
          if (hasKeyword(attacker, /furtivo/i)) throw new RulesViolation("unblockable-attacker");
          if (hasKeyword(attacker, /voar/i) && !hasKeyword(defender, /voar/i)) throw new RulesViolation("flying-blocker-required");
          defender.defenseUses = (defender.defenseUses || 0) + 1;
          if (defender.defenseUses >= defenderCapacity(defender)) defender.exhausted = true;
          const counter = effectiveAttack(state, defender, defenderOwner);
          const attackerFast = hasKeyword(attacker, /veloz/i); const defenderFast = hasKeyword(defender, /veloz/i);
          const defenderRemaining = Math.max(0, effectiveHealth(state, defender, defenderOwner) - (defender.damage || 0));
          let dealtByAttacker = 0; let dealtByDefender = 0;
          if (attackerFast && !defenderFast) {
            dealtByAttacker = dealCombatDamage(state, defender, defenderOwner, attacker, attackerOwner, attack); cleanupLethal(state, stack);
            if (defenderPlayer.board.includes(defender)) { dealtByDefender = dealCombatDamage(state, attacker, attackerOwner, defender, defenderOwner, counter); cleanupLethal(state, stack); }
          } else if (defenderFast && !attackerFast) {
            dealtByDefender = dealCombatDamage(state, attacker, attackerOwner, defender, defenderOwner, counter); cleanupLethal(state, stack);
            if (attackerPlayer.board.includes(attacker)) { dealtByAttacker = dealCombatDamage(state, defender, defenderOwner, attacker, attackerOwner, attack); cleanupLethal(state, stack); }
          } else {
            dealtByAttacker = dealCombatDamage(state, defender, defenderOwner, attacker, attackerOwner, attack);
            dealtByDefender = dealCombatDamage(state, attacker, attackerOwner, defender, defenderOwner, counter); cleanupLethal(state, stack);
          }
          damageDealtByAttacker = dealtByAttacker;
          if (dealtByAttacker > 0) stack.push({ kind: "event", event: { type: "onDamageTaken", owner: defenderOwner, targetId: defender.uid, sourceOwner: attackerOwner, sourceId: attacker.uid, amount: dealtByAttacker } });
          if (dealtByDefender > 0) {
            stack.push({ kind: "event", event: { type: "onDamageTaken", owner: attackerOwner, targetId: attacker.uid, sourceOwner: defenderOwner, sourceId: defender.uid, amount: dealtByDefender } });
            stack.push({ kind: "event", event: { type: "onAttachedCreatureDamage", owner: defenderOwner, sourceId: defender.uid, source: defender, targetIds: [attacker.uid], amount: dealtByDefender } });
          }
          if (hasKeyword(attacker, /atropelar/i) && dealtByAttacker > defenderRemaining) { const overflow = dealtByAttacker - defenderRemaining; defenderPlayer.life -= overflow; damageDealtByAttacker += overflow; }
        }
        const attackerSurvived = attackerPlayer.board.includes(attacker); const defenderDestroyed = !!defender && !defenderPlayer.board.includes(defender);
        if (defenderDestroyed && attackerSurvived) stack.push({ kind: "event", event: { type: "onCombatKill", owner: attackerOwner, sourceId: attacker.uid, source: attacker, card: defender } });
        if (damageDealtByAttacker > 0) {
          stack.push({ kind: "event", event: { type: "onAttachedCreatureDamage", owner: attackerOwner, sourceId: attacker.uid, source: attacker, targetIds: defender ? [defender.uid] : ["enemy-hero"], amount: damageDealtByAttacker } });
          if (!defender) stack.push({ kind: "event", event: { type: "onPlayerDamaged", owner: defenderOwner, sourceOwner: attackerOwner, sourceId: attacker.uid, source: attacker, amount: damageDealtByAttacker } });
        }
        stack.push({ kind: "event", event: { type: "onCombatDamage", owner: attackerOwner, sourceId: attacker.uid, source: attacker, targetIds: defender ? [defender.uid] : [], amount: damageDealtByAttacker } });
        stack.push({ kind: "event", event: { type: "onAttack", owner: attackerOwner, sourceId: attacker.uid, source: attacker } });
      } else if (item.command.type === "activate") {
        const entry = state.players[item.command.owner]; if (state.active !== item.command.owner) throw new RulesViolation("not-your-turn");
        const source = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].find((unit) => unit.uid === item.command.sourceId); const ability = source?.abilities?.find((candidate) => candidate.id === item.command.abilityId && candidate.trigger === "activated");
        if (!ability) throw new RulesViolation("ability-not-found"); if (!canExecuteCard(source, handlers)) throw new RulesViolation("card-not-migrated"); if (!availabilityMatches(state, source, item.command.owner, ability.availability)) throw new RulesViolation("ability-not-available"); actionLabel = source.name || source.uid; if (!usageAvailable(state, source, item.command.owner, ability)) throw new RulesViolation("ability-limit-reached"); validateTargets(state, item.command.owner, [ability], item.command, source); validateCosts(state, ability, item.command); payCosts(state, ability, item.command); claimUsage(state, source, item.command.owner, ability);
        /* A printed "Vire: Destrua este artefato e depois faça X" is an
           activated ability. The source remains available while X resolves;
           only the final self-destruction effect is placed at the end. */
        const selfDestruction = ability.effects.filter((effect) => effect.type === "destroy" && ["self", "this", "thisArtifact", "thisEnchantment"].includes(effect.target));
        const otherEffects = ability.effects.filter((effect) => !selfDestruction.includes(effect));
        [...otherEffects, ...selfDestruction].reverse().forEach((effect) => stack.push({ kind: "effect", effect, context: item.command }));
      } else if (item.command.type === "resolveDecision") {
        const decision = state.pendingDecision; if (!decision || (decision.owner !== item.command.owner && decision.context?.decisionOwner !== item.command.owner)) throw new RulesViolation("decision-not-owned");
        if (decision.kind === "replay-ability") {
          const selected = permanentUnits(state.players[item.command.owner]).find((card) => (card.uid === item.command.selectedCardId || card.id === item.command.selectedCardId) && card.type === (decision.effect.selector?.type || card.type));
          const ability = selected?.abilities?.find((candidate) => candidate.trigger === decision.effect.trigger);
          if (!selected || !ability) throw new RulesViolation("card-choice-required");
          const targetSteps = abilityTargetSteps(ability);
          if (targetSteps.length && !canSatisfyTargetSteps(state, item.command.owner, targetSteps)) throw new RulesViolation("ability-not-available");
          state.pendingDecision = null;
          const context = { ...decision.context, owner: item.command.owner, sourceId: selected.uid || selected.id, effectSource: selected };
          if (targetSteps.length) {
            state.pendingDecision = { kind: "targets", owner: item.command.owner, effect: { replayEffects: ability.effects }, context, targetSteps, sourceName: selected.name || "Primeiro Ato" };
            continue;
          }
          for (const effect of [...ability.effects].reverse()) stack.push({ kind: "effect", effect, context });
          continue;
        }
        if (decision.kind === "targets") {
          const targetIds = item.command.targetIds || []; const steps = decision.targetSteps || [];
          if (targetIds.length !== steps.length) throw new RulesViolation("invalid-target-count");
          steps.forEach((step, index) => { const id = targetIds[index]; const hero = /^(?:ally|enemy|controller)-hero$|^hero-[01]$/.test(id || ""); const targetOwner = hero ? (id === "enemy-hero" ? 1 - decision.owner : id === "ally-hero" || id === "controller-hero" ? decision.owner : Number(id.slice(-1))) : unitOwner(state, id); const target = hero || targetOwner < 0 ? null : permanentUnits(state.players[targetOwner]).find((unit) => unit.uid === id || unit.id === id); const targetKind = hero ? "hero" : target && (target.type === "Criatura" || state.players[targetOwner].board.includes(target)) ? "creature" : "permanent"; if (targetOwner < 0 || (!hero && !target) || !isValidTarget(step, decision.owner, targetOwner, targetKind)) throw new RulesViolation("invalid-target"); });
        }
        state.pendingDecision = null; const chosen = decision.effect.choices?.[item.command.choiceIndex] || decision.effect.replayEffects || [];
        const decisionContext = { ...decision.context, decisionOwner: item.command.owner, choiceIndex: item.command.choiceIndex, selectedCardId: item.command.selectedCardId, targetIds: item.command.targetIds ?? decision.context?.targetIds };
        for (const effect of [...chosen].reverse()) stack.push({ kind: "effect", effect, context: decisionContext });
      } else if (item.command.type === "reposition") {
        const pending = state.pendingReposition; if (!pending || !pending.owners.includes(item.command.owner) || pending.confirmed.includes(item.command.owner)) throw new RulesViolation("reposition-unavailable");
        const entry = state.players[item.command.owner]; const moves = item.command.moves || []; const slots = moves.map((move) => move.slot);
        if (slots.some((slot) => !Number.isInteger(slot) || slot < 0 || slot > 4) || new Set(slots).size !== slots.length) throw new RulesViolation("invalid-reposition");
        for (const move of moves) { const creature = entry.board.find((card) => card.uid === move.sourceId); if (!creature) throw new RulesViolation("invalid-reposition-card"); creature.slot = move.slot; for (const artifact of entry.support.filter((card) => card.attachedTo === creature.uid)) artifact.slot = move.slot; }
      } else if (item.command.type === "confirmReposition") {
        const pending = state.pendingReposition; if (!pending || !pending.owners.includes(item.command.owner)) throw new RulesViolation("reposition-unavailable");
        if (!pending.confirmed.includes(item.command.owner)) pending.confirmed.push(item.command.owner); if (pending.confirmed.length === pending.owners.length) state.pendingReposition = null;
      } else if (item.command.type === "emit") stack.push({ kind: "event", event: item.command.event });
      else if (item.command.type === "advancePhase") {
        if (state.pendingDecision || state.pendingReposition) throw new RulesViolation("interaction-pending"); const order = ["manutencao", "principal", "combate", "fim"]; const index = order.indexOf(state.phase); if (state.phase === "fim") state.players.forEach((entry) => { for (const unit of permanentUnits(entry)) { unit.modifiers = (unit.modifiers || []).filter((modifier) => modifier.duration !== "turn"); unit.abilities = (unit.abilities || []).filter((ability) => !ability.temporary); unit.temporaryTags = []; unit.temporarySubtypes = []; unit.combatRestrictions = (unit.combatRestrictions || []).filter((rule) => rule.duration !== "turn"); unit.attackLimit = 1; } }); if (state.phase === "combate" && state.players[state.active].board.some((unit) => !unit.exhausted && !unit.attackedThisTurn && !unit.summoning && !unit.stunned && !hasKeyword(unit, /atordoado/i) && attackPermissionMet(unit) && hasKeyword(unit, /indom[aá]vel/i))) throw new RulesViolation("indomitable-must-attack"); if (state.phase === "combate") state.players.forEach((entry) => entry.board.forEach((unit) => { unit.modifiers = (unit.modifiers || []).filter((modifier) => modifier.duration !== "combat"); if ((unit.defenseUses || 0) > 0) unit.exhausted = true; })); state.phase = order[(index + 1) % order.length]; if (state.phase === "fim") { stack.push({ kind: "event", event: { type: "onTurnEnd", owner: state.active } }); const due = (state.delayedEffects || []).filter((entry) => entry.timing === "turnEnd" && entry.owner === state.active); state.delayedEffects = (state.delayedEffects || []).filter((entry) => !due.includes(entry)); for (const delayed of due.reverse()) stack.push({ kind: "effect", effect: delayed.effect, context: delayed.context }); } if (state.phase === "combate") stack.push({ kind: "event", event: { type: "onCombatStart", owner: state.active } }); if (state.phase === "manutencao") { state.active = 1 - state.active; state.round += 1; const entry = state.players[state.active]; entry.abilityUses = {}; entry.subtypesEnteredThisTurn = {}; entry.turnCardsPlayed = 0; entry.turnSpellsPlayed = 0; for (const unit of permanentUnits(entry)) { unit.modifiers = (unit.modifiers || []).filter((modifier) => modifier.duration !== "turn" && modifier.duration !== "combat"); unit.temporaryTags = []; unit.temporarySubtypes = []; unit.combatRestrictions = (unit.combatRestrictions || []).filter((rule) => rule.duration !== "turn"); unit.attackLimit = 1; unit.summoning = false; unit.attackedThisTurn = false; unit.attacksThisTurn = 0; unit.defenseUses = 0; const immobilized = unit.immobilized || hasKeyword(unit, /imobilizado/i); if (immobilized) { unit.immobilized = false; unit.tags = (unit.tags || []).filter((tag) => !/imobilizado/i.test(String(tag))); } else unit.exhausted = false; } for (const unit of entry.board || []) unit.damage = 0; stack.push({ kind: "event", event: { type: "onMaintenance", owner: state.active } }); }
      } else throw new RulesViolation("unknown-command");
    } else if (item.kind === "effect") {
      const replacements = state.players[item.context.owner]?.replacementEffects || [];
      const replacementIndex = item.context.replacementApplied ? -1 : replacements.findIndex((entry) => String(item.context.effectSource?.name || "").toLowerCase().includes(String(entry.nameIncludes || "").toLowerCase()));
      if (replacementIndex >= 0) { replacements.splice(replacementIndex, 1); stack.push({ kind: "effect", effect: item.effect, context: { ...item.context, replacementApplied: true } }); }
      if (item.effect.type === "replaySelectedAbility") item.context.replayCandidateIds = replayAbilityCandidates(state, item.context.owner, item.effect).map((card) => card.uid || card.id);
      applyEffect(state, item.effect, item.context, handlers);
      if (item.context.effectSource?.name && (item.context.targetIds || []).length) stack.push({ kind: "event", event: { type: "onNamedEffectApplied", owner: item.context.owner, sourceId: item.context.sourceId, effectSource: item.context.effectSource, card: item.context.effectSource, effect: item.effect, targetIds: item.context.targetIds } });
      cleanupLethal(state, stack);
      for (const event of (state.rulesEvents || []).splice(0).reverse()) stack.push({ kind: "event", event });
      stack.push({ kind: "event", event: { type: `after:${item.effect.type}`, owner: item.context.owner, sourceId: item.context.sourceId } });
    } else if (item.kind === "event") {
      const triggered = activeAbilities(state, item.event); for (const trigger of triggered.reverse()) { claimUsage(state, trigger.source, trigger.owner, trigger.ability); const targetSteps = abilityTargetSteps(trigger.ability); const context = { owner: trigger.owner, sourceId: trigger.ability.replaySourceId || trigger.source.uid, event: item.event, targetIds: item.event.targetIds || [] }; if (targetSteps.length && !context.targetIds.length) { if (!canSatisfyTargetSteps(state, trigger.owner, targetSteps)) continue; state.pendingDecision = { kind: "targets", owner: trigger.owner, effect: { replayEffects: trigger.ability.effects }, context, targetSteps, sourceName: trigger.ability.replaySourceId ? item.event.card?.name || "Primeiro Ato" : trigger.source.name || "efeito ativado" }; break; } for (const effect of [...trigger.ability.effects].reverse()) stack.push({ kind: "effect", effect, context }); }
    }
  }
  state.events = (state.events || 0) + 1; state.log ||= []; state.log.unshift({ id: `rules-${state.round}-${state.events}`, text: command.type === "playCard" ? `${actionLabel} foi jogada pelo motor de regras.` : command.type === "activate" ? `${actionLabel} ativou sua habilidade.` : `${actionLabel}: ${command.type}.`, tone: "effect" });
  if (["playCard", "activate"].includes(command.type)) if (!command.skipPriority && state.pendingAction && command.hasPriority) state.pendingResponse = { responder: state.pendingAction.actor, actor: command.owner, action: actionLabel, passes: 0 }; else if (!command.skipPriority && !state.pendingAction) state.pendingResponse = command.hasPriority ? null : { responder: 1 - command.owner, actor: command.owner, action: actionLabel, passes: 0 };
  return { state, trace, steps };
}
