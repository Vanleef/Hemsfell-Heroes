import { executeCommand as executeRulesCommand } from "./engine.mjs";
import { RulesViolation } from "./effects.mjs";
import { PriorityMode, PriorityWindow, openResponseWindow, syncPriorityMetadata } from "./priority-state.mjs";

const clone = (value) => structuredClone(value);
const fold = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const cardId = (card) => card?.uid || card?.id;
const activeKeywords = (unit) => unit?.suffocated ? [] : [...(unit?.tags || []), ...(unit?.temporaryTags || []), ...(unit?.grantedKeywords || [])];
const hasKeyword = (unit, pattern) => activeKeywords(unit).some((tag) => pattern.test(String(tag)));

export const OnlineCombatStage = Object.freeze({
  COMBAT_START: "combat-start",
  DECLARE_ATTACKERS: "declare-attackers",
  AFTER_ATTACKERS: "after-attackers",
  DECLARE_BLOCKERS: "declare-blockers",
  AFTER_BLOCKERS: "after-blockers",
  RESOLVING: "resolving",
  COMBAT_END: "combat-end",
  COMPLETE: "complete",
});

function permanentById(state, id) {
  for (let owner = 0; owner < state.players.length; owner++) {
    const entry = state.players[owner];
    const card = [...(entry.board || []), ...(entry.support || []), ...(entry.terrain ? [entry.terrain] : [])].find((candidate) => cardId(candidate) === id);
    if (card) return { card, owner };
  }
  return null;
}

function defenderCapacity(unit) {
  if (unit?.suffocated) return 1;
  const text = [...activeKeywords(unit), unit?.text || ""].join(" ");
  return Math.max(1, Number(text.match(/defensor\s*(\d+)/i)?.[1] || 1));
}

function attackUses(unit) {
  return Number(unit?.attacksThisTurn ?? (unit?.attackedThisTurn ? 1 : 0));
}

function remainingAttacks(unit) {
  return Math.max(0, Number(unit?.attackLimit || 1) - attackUses(unit));
}

function validateAttacker(state, owner, attackerId) {
  /* declareAttack is the authoritative legality oracle for summoning sickness,
     statuses, Tessália commander rules, marker permissions and attack limits.
     The resulting clone is discarded; grouped declaration commits only after
     every selected attacker has passed the same engine validation. */
  executeRulesCommand(clone(state), { type: "declareAttack", owner, attackerId }, { priority: false });
}

function validateMandatoryAttackers(state, owner, attackInstances) {
  const probe = clone(state);
  const counts = new Map();
  for (const instance of attackInstances) counts.set(instance.attackerId, (counts.get(instance.attackerId) || 0) + 1);
  for (const unit of probe.players[owner].board || []) {
    const amount = counts.get(cardId(unit)) || 0;
    if (!amount) continue;
    unit.attacksThisTurn = attackUses(unit) + amount;
    unit.attackedThisTurn = unit.attacksThisTurn >= Number(unit.attackLimit || 1);
  }
  /* The engine's combat→Finalization preflight is the existing source of truth
     for Indomável. If an able mandatory attacker was omitted (including an
     extra permitted attack), the phase transition is rejected. */
  executeRulesCommand(probe, { type: "advancePhase", owner, skipPriority: true }, { priority: false });
}

function buildAttackInstances(state, owner, attackerIds) {
  const counts = new Map();
  const result = [];
  for (const attackerId of attackerIds || []) {
    const attacker = state.players[owner].board.find((unit) => cardId(unit) === attackerId);
    if (!attacker) throw new RulesViolation("invalid-attacker");
    const occurrence = counts.get(attackerId) || 0;
    if (occurrence >= remainingAttacks(attacker)) throw new RulesViolation("attack-limit-reached");
    if (occurrence === 0) validateAttacker(state, owner, attackerId);
    counts.set(attackerId, occurrence + 1);
    result.push({
      attackId: `combat-${state.round || 0}-${attacker.slot ?? 0}-${result.length}`,
      attackerId,
      declaredSlot: Number(attacker.slot ?? result.length),
      occurrence,
    });
  }
  return result.sort((a, b) => a.declaredSlot - b.declaredSlot || a.occurrence - b.occurrence || a.attackId.localeCompare(b.attackId));
}

export function beginOnlineCombat(state) {
  if (state.phase !== "combate") throw new RulesViolation("wrong-combat-priority");
  if (state.pendingResponse || state.pendingAction || state.pendingDecision || state.pendingReposition || state.combatAction) throw new RulesViolation("interaction-pending");
  const next = clone(state);
  next.onlineCombat = {
    stage: OnlineCombatStage.COMBAT_START,
    attackerOwner: state.active,
    attackers: [],
    blocks: [],
    resolutionIndex: 0,
  };
  openResponseWindow(next, {
    actor: state.active,
    responder: state.active,
    action: "início da etapa de Combate",
    window: PriorityWindow.COMBAT_START,
    pendingAction: { type: "onlineCheckpoint", checkpoint: OnlineCombatStage.COMBAT_START, owner: state.active },
  });
  return syncPriorityMetadata(next, { window: PriorityWindow.COMBAT_START });
}

export function finishCombatStartCheckpoint(state) {
  const next = clone(state);
  next.pendingAction = undefined;
  next.pendingResponse = null;
  next.priorityStack = undefined;
  next.onlineCombat ||= { attackerOwner: next.active, attackers: [], blocks: [], resolutionIndex: 0 };
  next.onlineCombat.stage = OnlineCombatStage.DECLARE_ATTACKERS;
  return syncPriorityMetadata(next, { mode: PriorityMode.ACTION, owner: next.active, window: null });
}

export function declareOnlineAttackers(state, owner, attackerIds = []) {
  if (state.phase !== "combate" || state.active !== owner) throw new RulesViolation("wrong-combat-priority");
  if (state.pendingResponse || state.pendingAction || state.pendingDecision || state.pendingReposition || state.combatAction) throw new RulesViolation("interaction-pending");
  const stage = state.onlineCombat?.stage;
  if (stage && stage !== OnlineCombatStage.DECLARE_ATTACKERS) throw new RulesViolation("attack-declaration-unavailable");
  if (new Set((attackerIds || []).map(String)).size > (attackerIds || []).length) {
    /* Duplicate creature ids are legal only for genuine additional attack uses;
       buildAttackInstances validates the remaining attack limit. This branch is
       intentionally not an error. */
  }
  const instances = buildAttackInstances(state, owner, attackerIds);
  validateMandatoryAttackers(state, owner, instances);
  const next = clone(state);
  next.onlineCombat = {
    stage: OnlineCombatStage.AFTER_ATTACKERS,
    attackerOwner: owner,
    attackers: instances,
    blocks: [],
    resolutionIndex: 0,
  };
  openResponseWindow(next, {
    actor: owner,
    responder: 1 - owner,
    action: instances.length ? "declaração de atacantes" : "declaração sem atacantes",
    window: PriorityWindow.AFTER_ATTACKERS,
    pendingAction: { type: "onlineCheckpoint", checkpoint: OnlineCombatStage.AFTER_ATTACKERS, owner },
  });
  return syncPriorityMetadata(next, { window: PriorityWindow.AFTER_ATTACKERS });
}

export function finishAfterAttackersCheckpoint(state) {
  const next = clone(state);
  next.pendingAction = undefined;
  next.pendingResponse = null;
  next.priorityStack = undefined;
  const combat = next.onlineCombat;
  if (!combat || combat.stage !== OnlineCombatStage.AFTER_ATTACKERS) throw new RulesViolation("combat-checkpoint-mismatch");
  const liveAttackers = combat.attackers.filter((instance) => next.players[combat.attackerOwner].board.some((unit) => cardId(unit) === instance.attackerId));
  combat.attackers = liveAttackers;
  combat.stage = liveAttackers.length ? OnlineCombatStage.DECLARE_BLOCKERS : OnlineCombatStage.COMBAT_END;
  return syncPriorityMetadata(next, {
    mode: PriorityMode.ACTION,
    owner: liveAttackers.length ? 1 - combat.attackerOwner : combat.attackerOwner,
    window: null,
  });
}

function validateBlockPair(state, combat, instance, defenderId) {
  const attacker = state.players[combat.attackerOwner].board.find((unit) => cardId(unit) === instance.attackerId);
  const defenderOwner = 1 - combat.attackerOwner;
  const defender = state.players[defenderOwner].board.find((unit) => cardId(unit) === defenderId);
  if (!attacker || !defender) throw new RulesViolation("invalid-defender");
  executeRulesCommand(clone(state), { type: "attack", owner: combat.attackerOwner, attackerId: instance.attackerId, defenderId }, { priority: false });
}

export function declareOnlineBlockers(state, owner, assignments = []) {
  const combat = state.onlineCombat;
  if (!combat || combat.stage !== OnlineCombatStage.DECLARE_BLOCKERS) throw new RulesViolation("defender-choice-unavailable");
  if (owner !== 1 - combat.attackerOwner) throw new RulesViolation("defender-choice-unavailable");
  if (state.pendingResponse || state.pendingAction || state.pendingDecision || state.pendingReposition || state.combatAction) throw new RulesViolation("interaction-pending");

  const attacks = new Map(combat.attackers.map((instance) => [instance.attackId, instance]));
  const chosen = new Map();
  const defenderCounts = new Map();
  for (const assignment of assignments || []) {
    const instance = attacks.get(assignment.attackId);
    if (!instance || chosen.has(assignment.attackId)) throw new RulesViolation("invalid-block-assignment");
    const defenderId = assignment.defenderId || null;
    if (defenderId) {
      const found = permanentById(state, defenderId);
      if (!found || found.owner !== owner || !state.players[owner].board.includes(found.card)) throw new RulesViolation("invalid-defender");
      const used = Number(found.card.defenseUses || 0);
      const nextCount = (defenderCounts.get(defenderId) || 0) + 1;
      if (used + nextCount > defenderCapacity(found.card)) throw new RulesViolation("defender-capacity-exceeded");
      validateBlockPair(state, combat, instance, defenderId);
      defenderCounts.set(defenderId, nextCount);
    }
    chosen.set(assignment.attackId, { attackId: assignment.attackId, defenderId });
  }
  for (const instance of combat.attackers) if (!chosen.has(instance.attackId)) chosen.set(instance.attackId, { attackId: instance.attackId, defenderId: null });

  const next = clone(state);
  next.onlineCombat.blocks = next.onlineCombat.attackers.map((instance) => chosen.get(instance.attackId));
  next.onlineCombat.stage = OnlineCombatStage.AFTER_BLOCKERS;
  openResponseWindow(next, {
    actor: owner,
    responder: combat.attackerOwner,
    action: "declaração de bloqueadores",
    window: PriorityWindow.AFTER_BLOCKERS,
    pendingAction: { type: "onlineCheckpoint", checkpoint: OnlineCombatStage.AFTER_BLOCKERS, owner },
  });
  return syncPriorityMetadata(next, { window: PriorityWindow.AFTER_BLOCKERS });
}

export function finishAfterBlockersCheckpoint(state) {
  const next = clone(state);
  next.pendingAction = undefined;
  next.pendingResponse = null;
  next.priorityStack = undefined;
  if (!next.onlineCombat || next.onlineCombat.stage !== OnlineCombatStage.AFTER_BLOCKERS) throw new RulesViolation("combat-checkpoint-mismatch");
  next.onlineCombat.stage = OnlineCombatStage.RESOLVING;
  next.onlineCombat.resolutionIndex = 0;
  return syncPriorityMetadata(next, { mode: PriorityMode.RESOLVING, owner: null, window: null });
}

export function combatDeclarationView(state) {
  const combat = state?.onlineCombat;
  if (!combat) return null;
  return clone(combat);
}
