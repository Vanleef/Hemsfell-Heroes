const clone = (value) => structuredClone(value);
const cardId = (card) => card?.uid || card?.id;

const boardCard = (state, owner, id) =>
  state?.players?.[owner]?.board?.find((card) => cardId(card) === id);

const baseCard = (card) => {
  if (!card) return undefined;
  const copy = clone(card);
  for (const key of [
    "uid", "slot", "damage", "bonusAtk", "bonusHp", "temporaryAtk",
    "temporaryHp", "temporaryTags", "temporarySubtypes", "modifiers",
    "grantedKeywords", "staticModifiers", "attackedThisTurn", "attacksThisTurn",
    "exhausted", "summoning", "frozen", "stunned", "suffocated",
    "immobilized", "defenseUses", "attachedTo",
  ]) delete copy[key];
  return copy;
};

/**
 * Preserve a just-resolved authoritative combat as presentation data.
 *
 * Online snapshots intentionally clear `combatAction` as soon as damage and
 * triggers finish. The UI must not keep that object inside the rules state just
 * to animate it, because doing so can reopen an already completed interaction.
 */
export function resolvedCombatPresentation(previous, next) {
  const combat = previous?.combatAction;
  if (!combat || next?.combatAction || !combat.attackerUid) return null;

  const attackerOwner = combat.attackerOwner;
  const defenderOwner = 1 - attackerOwner;
  const attackerBefore = boardCard(previous, attackerOwner, combat.attackerUid);
  const defenderBefore = combat.defenderUid
    ? boardCard(previous, defenderOwner, combat.defenderUid)
    : undefined;
  const attackerCard = baseCard(combat.attackerCard || attackerBefore);
  if (!attackerCard) return null;

  const targetHero = !!combat.targetHero || !combat.defenderUid;
  const defenderCard = targetHero
    ? undefined
    : baseCard(combat.defenderCard || defenderBefore);
  const attackerDestroyed = !boardCard(next, attackerOwner, combat.attackerUid);
  const defenderDestroyed = !!combat.defenderUid
    && !boardCard(next, defenderOwner, combat.defenderUid);
  const destroyed = [];
  if (attackerDestroyed) destroyed.push("attacker");
  if (defenderDestroyed) destroyed.push("defender");

  const heroDamage = targetHero
    ? Math.max(0, Number(previous.players?.[defenderOwner]?.life || 0) - Number(next.players?.[defenderOwner]?.life || 0))
    : undefined;
  const winnerText = attackerDestroyed && defenderDestroyed
    ? "AMBAS FORAM DESTRUÍDAS"
    : defenderDestroyed
      ? `${attackerCard.name} VENCEU O CONFRONTO`
      : attackerDestroyed
        ? `${defenderCard?.name || "O defensor"} VENCEU O CONFRONTO`
        : targetHero
          ? "DANO DIRETO AO HERÓI"
          : "AMBAS SOBREVIVERAM";

  return {
    ...clone(combat),
    attackerCard,
    defenderCard,
    targetHero,
    stage: "charging",
    ...(heroDamage === undefined ? {} : { attackDamage: heroDamage }),
    destroyed,
    winnerText,
    result: targetHero ? `${heroDamage || 0} de dano direto` : "Combate resolvido pelo motor de regras",
  };
}

/**
 * Synthesize presentation for a direct attack that the authoritative server
 * completed inside the same command response. This happens when no blocking
 * decision is legal (notably Voar/Indomável), so neither snapshot exposes an
 * intermediate combatAction for the client to animate.
 */
export function immediateDirectCombatPresentation(previous, next, attackerOwner, attackerUid) {
  if (!previous || !next || previous.combatAction || next.combatAction || !attackerUid) return null;
  const defenderOwner = 1 - attackerOwner;
  const attackerBefore = boardCard(previous, attackerOwner, attackerUid);
  if (!attackerBefore) return null;

  const attackerAfter = boardCard(next, attackerOwner, attackerUid);
  const heroDamage = Math.max(
    0,
    Number(previous.players?.[defenderOwner]?.life || 0) - Number(next.players?.[defenderOwner]?.life || 0),
  );
  const attackWasCommitted = heroDamage > 0
    || !attackerAfter
    || (!attackerBefore.attackedThisTurn && !!attackerAfter?.attackedThisTurn)
    || Number(attackerAfter?.attacksThisTurn || 0) > Number(attackerBefore.attacksThisTurn || 0)
    || (!attackerBefore.exhausted && !!attackerAfter?.exhausted);
  if (!attackWasCommitted) return null;

  const attackerCard = baseCard(attackerBefore);
  return {
    attackerOwner,
    attackerUid,
    attackerCard,
    targetHero: true,
    stage: "charging",
    attackDamage: heroDamage,
    destroyed: attackerAfter ? [] : ["attacker"],
    winnerText: "DANO DIRETO AO HERÓI",
    result: `${heroDamage} de dano direto`,
  };
}
