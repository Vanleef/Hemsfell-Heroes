import { executeCommand as executeBase } from "./engine-base.mjs";
import { RulesViolation } from "./effects.mjs";
import { getExplicitCardRule } from "./card-rules.mjs";
import { propagateWeddingRingLinks, reservePriorityPayment, restorePriorityPayment } from "./match-integrity.mjs";

export * from "./engine-base.mjs";
export { propagateWeddingRingLinks, priorityPlayCost } from "./match-integrity.mjs";

const clone = (value) => structuredClone(value);
const fold = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const accelerated = (card) => (card?.tags || []).some((tag) => /acelerado/i.test(String(tag))) || /\bacelerado\b/i.test(String(card?.text || ""));
const cardInHand = (state, command) => state.players?.[command.owner]?.hand?.find((card) => card.id === command.cardId || card.uid === command.cardId);
const unitById = (state, id) => state.players.flatMap((entry) => [...(entry.board || []), ...(entry.support || []), ...(entry.terrain ? [entry.terrain] : [])]).find((unit) => unit.uid === id || unit.id === id);
const unitOwner = (state, id) => state.players.findIndex((entry) => [...(entry.board || []), ...(entry.support || []), ...(entry.terrain ? [entry.terrain] : [])].some((unit) => unit.uid === id || unit.id === id));
const criticalTriggeredPages = new Set([10, 46]);
const criticalAbilityMatches = (page, ability) => {
  if (page === 10) return ability?.trigger === "onDestroyed" && (ability.effects || []).some((effect) => effect.type === "damageAll");
  if (page === 46) return ability?.trigger === "onTurnEnd" && (ability.effects || []).some((effect) => effect.type === "moveSelf");
  return false;
};
const restoreCriticalTriggeredRules = (inputState) => {
  const liveUnits = (inputState.players || []).flatMap((entry) => [...(entry.board || []), ...(entry.support || []), ...(entry.terrain ? [entry.terrain] : [])]);
  if (!liveUnits.some((unit) => criticalTriggeredPages.has(Number(unit?.page)))) return inputState;
  const state = clone(inputState);
  for (const entry of state.players || []) {
    for (const unit of [...(entry.board || []), ...(entry.support || []), ...(entry.terrain ? [entry.terrain] : [])]) {
      const page = Number(unit?.page);
      if (!criticalTriggeredPages.has(page)) continue;
      const rule = getExplicitCardRule(`p${page}`);
      if (!Array.isArray(rule)) continue;
      const canonical = rule.find((ability) => criticalAbilityMatches(page, ability));
      if (!canonical) continue;
      const current = (unit.abilities || []).find((ability) => criticalAbilityMatches(page, ability));
      const hydrated = { ...clone(canonical), id: current?.id || canonical.id || `${unit.id || `p${page}`}-${page === 10 ? "last-breath" : "turn-end"}` };
      if (page === 46) hydrated.condition = { ...(hydrated.condition || {}), eventOwnerIsController: true };
      unit.abilities = [...(unit.abilities || []).filter((ability) => !criticalAbilityMatches(page, ability)), hydrated];
    }
  }
  return state;
};
const spellElement = (card, command) => {
  if (command?.chosenElement) return command.chosenElement;
  const exact = ["Fogo", "Água", "Terra", "Ar"].find((element) => (card?.tags || []).some((tag) => fold(tag) === fold(element)));
  if (exact) return exact;
  return String(card?.text || "").match(/Elemento\s*:\s*(Fogo|Água|Terra|Ar)/i)?.[1];
};
const frameLabel = (state, command) => cardInHand(state, command)?.name || state.pendingResponse?.action || command.action || command.cardId || command.type;
const commandFrame = (state, command) => ({ kind: "command", actor: command.owner, label: frameLabel(state, command), command: clone(command) });
const rootPriorityFrame = (state) => {
  if (state.pendingAction) return { kind: "command", actor: state.pendingAction.owner, label: state.pendingResponse?.action || state.pendingAction.action || state.pendingAction.cardId || state.pendingAction.type, command: clone(state.pendingAction) };
  if (state.combatAction?.stage === "priority") return { kind: "combat", actor: state.combatAction.attackerOwner, label: state.pendingResponse?.action || state.combatAction.attackerCard?.name || "ataque" };
  return null;
};
const setKeywordState = (unit, keyword) => {
  const key = fold(keyword);
  if (key.includes("sufocado")) { unit.suffocated = true; unit.suffocatedUntilTurnEnd = true; }
  else if (key.includes("atordoado")) unit.stunned = true;
  else if (key.includes("congelado")) unit.frozen = true;
  else if (key.includes("imobilizado")) unit.immobilized = true;
  unit.temporaryTags ||= [];
  if (keyword && !unit.temporaryTags.some((tag) => fold(tag) === key)) unit.temporaryTags.push(keyword);
};
const consumeElementalPromise = (before, after, command) => {
  if (command.type !== "playCard") return;
  const card = cardInHand(before, command);
  if (!card || card.type !== "Feitiço") return;
  const stillInHand = after.players?.[command.owner]?.hand?.some((candidate) => candidate.id === command.cardId || candidate.uid === command.cardId);
  if (stillInHand) return;
  const afterEntry = after.players[command.owner];
  const replayEffects = (card.abilities || []).filter((ability) => ability.trigger === "onPlay").flatMap((ability) => ability.effects || []);
  afterEntry.lastSpellReplay = { sourceId: card.id, card: clone(card), effects: clone(replayEffects), targetIds: clone(command.targetIds || []), chosenElement: command.chosenElement, selectedImageName: command.selectedImageName, cafeEffect: command.cafeEffect, elementalTargetId: command.elementalTargetId };
  const element = spellElement(card, command);
  if (!element) return;
  const beforeEntry = before.players[command.owner];
  const pendingBefore = clone(beforeEntry.nextElementEffects || []);
  const consumed = pendingBefore.filter((effect) => fold(effect.element) === fold(element));
  const next = [...(afterEntry.nextElementEffects || [])];
  for (const old of consumed) {
    const index = next.findIndex((effect) => fold(effect.element) === fold(old.element) && fold(effect.keyword) === fold(old.keyword));
    if (index >= 0) next.splice(index, 1);
  }
  afterEntry.nextElementEffects = next.map((effect) => ({ ...effect, expires: "turn" }));
  afterEntry.lastSpellElement = element;
  if (!consumed.length) return;
  const selectedIds = command.elementalTargetId ? [command.elementalTargetId] : (command.targetIds || []);
  const selected = selectedIds.map((id) => unitById(after, id)).filter(Boolean);
  const targets = selected.length ? selected : [61, 62, 65].includes(Number(card.page)) ? [] : (after.players[1 - command.owner].board || []);
  for (const promise of consumed) for (const target of targets) setKeywordState(target, promise.keyword);
};
const expireElementalPromises = (before, after, command) => {
  for (const entry of after.players || []) if (entry.nextElementEffects?.length) entry.nextElementEffects = entry.nextElementEffects.map((effect) => ({ ...effect, expires: "turn" }));
  if (command.type === "advancePhase" && before.phase === "fim") {
    const owner = before.active;
    if (after.players?.[owner]) { after.players[owner].nextElementEffects = []; after.players[owner].elementChain = undefined; }
    if (after.players?.[after.active]) delete after.players[after.active].lastSpellReplay;
  }
};
const markDamagedOwner = (state, sourceId, owner) => {
  const source = unitById(state, sourceId);
  if (!source || owner < 0) return;
  source.damagedOwnersThisTurn ||= [];
  if (!source.damagedOwnersThisTurn.includes(owner)) source.damagedOwnersThisTurn.push(owner);
};
const combatSnapshot = (state, command) => {
  const forced = command.type === "resolveDecision" && state.pendingDecision?.kind === "forced-attack";
  if (command.type !== "attack" && !forced) return null;
  const attackerId = command.attackerId;
  const defenderId = command.defenderId;
  if (!attackerId) return null;
  const attackerOwner = unitOwner(state, attackerId);
  const defenderOwner = attackerOwner >= 0 ? 1 - attackerOwner : -1;
  const attacker = unitById(state, attackerId), defender = defenderId ? unitById(state, defenderId) : null;
  return {
    attackerId, defenderId, attackerOwner, defenderOwner,
    attackerDamage: Number(attacker?.damage || 0), defenderDamage: Number(defender?.damage || 0),
    attackerLife: attackerOwner >= 0 ? Number(state.players[attackerOwner]?.life || 0) : 0,
    defenderLife: defenderOwner >= 0 ? Number(state.players[defenderOwner]?.life || 0) : 0,
    attackerAtk: Number(attacker?.atk || 0), defenderAtk: Number(defender?.atk || 0),
  };
};
const recordCombatDamage = (after, snapshot) => {
  if (!snapshot || snapshot.attackerOwner < 0 || snapshot.defenderOwner < 0) return;
  const attackerAfter = unitById(after, snapshot.attackerId), defenderAfter = snapshot.defenderId ? unitById(after, snapshot.defenderId) : null;
  const defenderWasHit = snapshot.defenderId
    ? (!defenderAfter || Number(defenderAfter.damage || 0) > snapshot.defenderDamage) && snapshot.attackerAtk > 0
    : Number(after.players[snapshot.defenderOwner]?.life || 0) < snapshot.defenderLife;
  const attackerWasHit = snapshot.defenderId && (!attackerAfter || Number(attackerAfter.damage || 0) > snapshot.attackerDamage) && snapshot.defenderAtk > 0;
  if (defenderWasHit && attackerAfter) markDamagedOwner(after, snapshot.attackerId, snapshot.defenderOwner);
  if (attackerWasHit && defenderAfter) markDamagedOwner(after, snapshot.defenderId, snapshot.attackerOwner);
};
const isVengeance = (card) => Number(card?.page) === 160 || fold(card?.name) === "vinganca";
const validateVengeance = (state, command) => {
  if (command.type !== "playCard") return;
  const card = cardInHand(state, command);
  if (!isVengeance(card)) return;
  const targetId = command.targetIds?.[0];
  const target = targetId ? unitById(state, targetId) : null;
  if (!target || !(target.damagedOwnersThisTurn || []).includes(command.owner)) throw new RulesViolation("vengeance-target-must-have-damaged-controller-this-turn");
};
const validateProtectedCreatureSlot = (state, command) => {
  if (command.type !== "playCard" || command.placementZone === "support") return;
  const card = cardInHand(state, command);
  if (!card || card.type !== "Criatura" || !Number.isInteger(command.slot)) return;
  const occupied = state.players?.[command.owner]?.board?.find((unit) => unit.slot === command.slot);
  if (occupied?.cannotBeDestroyedForSpace) throw new RulesViolation("protected-space-occupant");
};
const hasActivatedAbility = (state, unit) => {
  if ((unit?.abilities || []).some((ability) => ability.trigger === "activated")) return true;
  const printed = (state.cardCatalog || []).find((card) => card.page === unit?.page || card.id === unit?.id);
  return !!printed?.abilities?.some((ability) => ability.trigger === "activated");
};
const syncEntryTurnActivationLocks = (state) => {
  for (const entry of state.players || []) {
    for (const unit of [...(entry.board || []), ...(entry.support || []), ...(entry.terrain ? [entry.terrain] : [])]) {
      const activated = hasActivatedAbility(state, unit);
      if (!activated) { delete unit.activationLockedOnEntry; continue; }
      unit.activationLockedOnEntry = unit.enteredRound === state.round;
      if (unit.type !== "Criatura" && unit.activationLockedOnEntry) unit.summoning = true;
    }
  }
};
const syncTemporarySuffocatedState = (state) => {
  for (const entry of state.players || []) {
    for (const unit of [...(entry.board || []), ...(entry.support || []), ...(entry.terrain ? [entry.terrain] : [])]) {
      const hasTemporarySuffocated = (unit.temporaryTags || []).some((tag) => fold(tag).includes("sufocado"));
      if (hasTemporarySuffocated) {
        unit.suffocated = true;
        unit.suffocatedUntilTurnEnd = true;
      } else if (unit.suffocatedUntilTurnEnd) {
        delete unit.suffocatedUntilTurnEnd;
        if (!(unit.suffocatedBySources || []).length) unit.suffocated = false;
      }
    }
  }
};
const resolveRasmusCoffeeThreshold = (state) => {
  for (const entry of state.players || []) {
    if (entry.heroId !== "rasmus") continue;
    const coffee = typeof entry.markers === "object" ? Number(entry.markers?.coffee || 0) : 0;
    if (coffee < 10) continue;
    const template = (entry.extraDeck || []).find((card) => Number(card.page) === 231 || fold(card.name) === "cafe especial") || (state.cardCatalog || []).find((card) => Number(card.page) === 231 || fold(card.name) === "cafe especial");
    if (!template) continue;
    entry.markers = { ...(typeof entry.markers === "object" ? entry.markers : {}), coffee: 0 };
    state.nextGeneratedId = Number(state.nextGeneratedId || 0) + 1;
    entry.hand ||= [];
    entry.hand.push({ ...clone(template), id: `${template.id || "p231"}-generated-coffee-${state.round || 0}-${state.nextGeneratedId}`, generatedImage: true, imageCard: true });
  }
};
const normalizeGeneratedHandImages = (state) => {
  for (const entry of state.players || []) {
    entry.hand = (entry.hand || []).map((card) => {
      if (!card?.generatedImage || !card?.imageCard || !card?.uid) return card;
      const uniqueId = card.uid;
      const {
        uid, slot, enteredRound, attackedThisTurn, attacksThisTurn, summoning, exhausted,
        damage, bonusAtk, bonusHp, frozen, stunned, suffocated, immobilized, defenseUses,
        markers, modifiers, grantedKeywords, staticModifiers, activationLockedOnEntry, ...handCard
      } = card;
      return { ...handCard, id: uniqueId, generatedImage: true, imageCard: true };
    });
    /* Created Images are copies of Extra Deck cards; after a generated spell
       resolves the copy dissipates instead of becoming a normal grave card. */
    entry.grave = (entry.grave || []).filter((card) => !card?.generatedImage);
  }
};
const postProcess = (before, after, command) => {
  const snapshot = combatSnapshot(before, command);
  consumeElementalPromise(before, after, command);
  expireElementalPromises(before, after, command);
  recordCombatDamage(after, snapshot);
  syncTemporarySuffocatedState(after);
  resolveRasmusCoffeeThreshold(after);
  normalizeGeneratedHandImages(after);
  syncEntryTurnActivationLocks(after);
  propagateWeddingRingLinks(before, after);
};
const stackResult = (state, trace = [], steps = 0) => ({ state, trace, steps });

const restoreCommandPayment = (inputState, inputCommand) => {
  if (!inputCommand?.__priorityPayment) return { state: inputState, command: inputCommand };
  const state = restorePriorityPayment(inputState, inputCommand.__priorityPayment, inputCommand.owner);
  const command = { ...inputCommand };
  delete command.__priorityPayment;
  return { state, command };
};
const restoreRootPaymentBeforeResolution = (inputState, command) => {
  const payment = inputState.pendingAction?.__priorityPayment;
  if (command?.type !== "passPriority" || !payment || (inputState.pendingResponse?.passes || 0) < 1) return inputState;
  const state = restorePriorityPayment(inputState, payment, inputState.pendingAction.owner);
  state.pendingAction = { ...state.pendingAction };
  delete state.pendingAction.__priorityPayment;
  return state;
};

export function executeCommand(rawInputState, rawCommand, options = {}) {
  const restored = restoreCommandPayment(rawInputState, rawCommand);
  let inputState = restoreRootPaymentBeforeResolution(restored.state, restored.command);
  inputState = restoreCriticalTriggeredRules(inputState);
  let command = restored.command;
  const priorityEnabled = !!options.priority;

  if (priorityEnabled && command.type === "playCard" && command.hasPriority && !command.skipPriority && inputState.pendingResponse) {
    if (inputState.pendingResponse.responder !== command.owner) throw new RulesViolation("not-your-priority");
    const card = cardInHand(inputState, command);
    if (!card || !accelerated(card)) throw new RulesViolation("accelerated-response-required");
    const existingStack = inputState.priorityStack || [];
    if (existingStack.some((frame) => frame.kind === "command" && frame.command?.type === "playCard" && frame.command?.owner === command.owner && frame.command?.cardId === command.cardId)) throw new RulesViolation("response-card-already-on-stack");
    const root = existingStack.length ? null : rootPriorityFrame(inputState);
    if (!existingStack.length && !root) throw new RulesViolation("nothing-to-respond-to");
    const state = clone(inputState);
    const payment = reservePriorityPayment(state, command);
    const paidCommand = { ...command, __priorityPayment: payment };
    state.priorityStack = existingStack.length ? clone(existingStack) : [root];
    state.priorityStack.push(commandFrame(inputState, paidCommand));
    state.pendingResponse = { responder: 1 - command.owner, actor: command.owner, action: card.name || command.cardId, passes: 0, reservedCost: payment.cost };
    return stackResult(state, ["priority:push-accelerated", "priority:cost-paid"], 0);
  }

  if (priorityEnabled && command.type === "activateHero" && command.hasPriority && !command.skipPriority && inputState.pendingResponse) {
    if (inputState.pendingResponse.responder !== command.owner) throw new RulesViolation("not-your-priority");
    const existingStack = inputState.priorityStack || [];
    if (existingStack.some((frame) => frame.kind === "command" && frame.command?.type === "activateHero" && frame.command?.owner === command.owner && frame.command?.abilityId === command.abilityId)) throw new RulesViolation("hero-response-already-on-stack");
    const root = existingStack.length ? null : rootPriorityFrame(inputState);
    if (!existingStack.length && !root) throw new RulesViolation("nothing-to-respond-to");
    const state = clone(inputState);
    state.priorityStack = existingStack.length ? clone(existingStack) : [root];
    state.priorityStack.push(commandFrame(inputState, command));
    state.pendingResponse = { responder: 1 - command.owner, actor: command.owner, action: command.abilityId || "habilidade de herói", passes: 0 };
    return stackResult(state, ["priority:push-hero-ability"], 0);
  }

  if (priorityEnabled && command.type === "passPriority" && (inputState.priorityStack?.length || 0) > 1) {
    const pending = inputState.pendingResponse;
    if (!pending || pending.responder !== command.owner) throw new RulesViolation("not-your-priority");
    if ((pending.passes || 0) === 0) {
      const state = clone(inputState);
      state.pendingResponse = { ...pending, responder: pending.actor, passes: 1 };
      return stackResult(state, ["priority:first-pass"], 0);
    }

    const stack = clone(inputState.priorityStack);
    const top = stack.pop();
    if (!top || top.kind !== "command") throw new RulesViolation("invalid-priority-stack");
    const resolutionState = clone(inputState);
    delete resolutionState.priorityStack;
    resolutionState.pendingAction = undefined;
    resolutionState.pendingResponse = null;
    validateVengeance(resolutionState, top.command);
    validateProtectedCreatureSlot(resolutionState, top.command);
    const resolved = executeCommand(resolutionState, { ...top.command, skipPriority: true }, { ...options, priority: false });
    const state = resolved.state;

    if (stack.length > 1) {
      const next = stack.at(-1);
      state.priorityStack = stack;
      const root = stack[0];
      state.pendingAction = root.kind === "command" ? clone(root.command) : undefined;
      state.pendingResponse = { responder: 1 - next.actor, actor: next.actor, action: next.label, passes: 0 };
    } else {
      delete state.priorityStack;
      const root = stack[0];
      if (root?.kind === "command") {
        state.pendingAction = clone(root.command);
        state.pendingResponse = { responder: 1 - root.actor, actor: root.actor, action: root.label, passes: 0 };
      } else if (root?.kind === "combat") {
        state.pendingAction = undefined;
        state.pendingResponse = { responder: 1 - root.actor, actor: root.actor, action: root.label, passes: 0 };
      }
    }
    return stackResult(state, [...(resolved.trace || []), "priority:resolve-top"], resolved.steps || 0);
  }

  if (command.type === "activate") {
    const source = unitById(inputState, command.sourceId);
    if (source?.exhausted && hasActivatedAbility(inputState, source)) throw new RulesViolation("cannot-tap");
    if (source?.enteredRound === inputState.round && hasActivatedAbility(inputState, source)) throw new RulesViolation(source.type === "Criatura" ? "summoning-sickness" : "cannot-tap");
  }
  validateVengeance(inputState, command);
  validateProtectedCreatureSlot(inputState, command);
  const before = clone(inputState);
  const pendingBefore = command.type === "passPriority" && before.pendingAction ? clone(before.pendingAction) : null;
  const result = executeBase(inputState, command, options);
  if (priorityEnabled && command.type === "playCard" && !command.skipPriority && !command.hasPriority && result.state.pendingAction?.type === "playCard" && result.state.pendingAction.cardId === command.cardId && !result.state.pendingAction.__priorityPayment) {
    const payment = reservePriorityPayment(result.state, command);
    result.state.pendingAction.__priorityPayment = payment;
    if (result.state.pendingResponse) result.state.pendingResponse = { ...result.state.pendingResponse, reservedCost: payment.cost };
    result.trace = [...(result.trace || []), "priority:cost-paid-before-window"];
  }
  postProcess(before, result.state, command);
  if (pendingBefore?.type === "playCard" && !result.state.pendingAction) postProcess(before, result.state, { ...pendingBefore, skipPriority: true });
  return result;
}