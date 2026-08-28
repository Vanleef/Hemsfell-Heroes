import { executeCommand } from "./engine-core.mjs";

const clone = (value) => structuredClone(value);
const cardId = (card) => card?.uid || card?.id;
const fold = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function hasCombatKeyword(unit, keyword) {
  if (!unit || unit.suffocated) return false;
  const wanted = fold(keyword);
  return [...(unit.tags || []), ...(unit.temporaryTags || []), ...(unit.grantedKeywords || []), unit.text || ""]
    .some((value) => fold(value).includes(wanted));
}

/**
 * Query combat legality through the authoritative rules engine instead of
 * duplicating summoning sickness, statuses, commander rules, marker gates or
 * attack-limit checks in UI/Online/AI code.
 */
export function listAttackCapableCreatures(state, owner) {
  if (!state || state.phase !== "combate" || state.active !== owner) return [];
  if (state.pendingResponse || state.pendingAction || state.pendingDecision || state.pendingReposition || state.combatAction) return [];
  return (state.players?.[owner]?.board || []).filter((unit) => {
    const attackerId = cardId(unit);
    if (!attackerId) return false;
    try {
      executeCommand(clone(state), { type: "declareAttack", owner, attackerId }, { priority: false });
      return true;
    } catch {
      return false;
    }
  });
}

/** Return only blockers accepted by the same engine that resolves the attack. */
export function listLegalBlockers(state, defenderOwner, attackerOrId) {
  if (!state || ![0, 1].includes(defenderOwner)) return [];
  const attackerOwner = 1 - defenderOwner;
  const attackerId = typeof attackerOrId === "string" ? attackerOrId : cardId(attackerOrId);
  if (!attackerId) return [];
  return (state.players?.[defenderOwner]?.board || []).filter((unit) => {
    const defenderId = cardId(unit);
    if (!defenderId) return false;
    try {
      executeCommand(clone(state), {
        type: "attack",
        owner: attackerOwner,
        attackerId,
        defenderId,
        skipPriority: true,
      }, { priority: false });
      return true;
    } catch {
      return false;
    }
  });
}

export function listPendingIndomitableAttackers(state, owner) {
  return listAttackCapableCreatures(state, owner).filter((unit) => hasCombatKeyword(unit, "Indomável"));
}

/**
 * The phase transition itself remains the legality oracle, including the
 * existing Indomável rule. The clone guarantees this query cannot advance the
 * real match or resolve end-of-combat effects.
 */
export function canEndCombat(state, owner) {
  if (!state || state.phase !== "combate" || state.active !== owner) return false;
  if (state.pendingResponse || state.pendingAction || state.pendingDecision || state.pendingReposition || state.combatAction) return false;
  try {
    executeCommand(clone(state), { type: "advancePhase", owner, skipPriority: true }, { priority: false });
    return true;
  } catch {
    return false;
  }
}

export function combatIdleView(state, owner = state?.active) {
  const attackers = listAttackCapableCreatures(state, owner);
  const mandatory = attackers.filter((unit) => hasCombatKeyword(unit, "Indomável"));
  return {
    owner,
    attackerIds: attackers.map(cardId),
    mandatoryAttackerIds: mandatory.map(cardId),
    canEndCombat: canEndCombat(state, owner),
  };
}
