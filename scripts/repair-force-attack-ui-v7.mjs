import { readFile, writeFile } from "node:fs/promises";

const normalize = (value) => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const read = async (path) => normalize(await readFile(path, "utf8"));
const write = async (path, value) => writeFile(path, normalize(value));

// ---------------------------------------------------------------------------
// p17 / forceAttack
// Resolve the selected Dragon-vs-enemy-creature combat directly inside the
// decision resolver. Re-enqueuing a normal `attack` command used to re-enter
// combat/priority state and could leave the decision flow cycling indefinitely.
// This path keeps normal combat damage semantics without opening another combat
// declaration or response window.
// ---------------------------------------------------------------------------
{
  const path = "app/rules-engine/engine.mjs";
  let source = await read(path);

  if (!source.includes("/* forced-attack-v7 */")) {
    const start = source.indexOf('        if (decision.kind === "forced-attack") {');
    const end = source.indexOf('        if (decision.kind === "sacrifice-and-fill") {', start);
    if (start < 0 || end < 0) throw new Error("Could not locate forced-attack decision block.");

    const replacement = `        if (decision.kind === "forced-attack") {
          /* forced-attack-v7: direct one-shot creature combat; never requeues a normal attack command. */
          const attackerOwner = decision.context?.owner ?? decision.owner ?? item.command.owner;
          const defenderOwner = 1 - attackerOwner;
          const attackerId = item.command.attackerId || item.command.targetIds?.[0];
          const defenderId = item.command.defenderId || item.command.targetIds?.[1];
          const attackerPlayer = state.players[attackerOwner];
          const defenderPlayer = state.players[defenderOwner];
          const attacker = attackerPlayer.board.find((card) => card.uid === attackerId || card.id === attackerId);
          const defender = defenderPlayer.board.find((card) => card.uid === defenderId || card.id === defenderId);
          const attacksUsed = attacker?.attacksThisTurn ?? (attacker?.attackedThisTurn ? 1 : 0);
          const requiresReady = decision.effect.attacker?.ready !== false;

          if (
            !attacker || !defender
            || (decision.effect.attacker?.subtype && !subtype(attacker, decision.effect.attacker.subtype))
            || (requiresReady && attacker.exhausted)
            || attacker.cannotAttack
            || attacker.summoning
            || attacker.stunned
            || hasKeyword(attacker, /atordoado/i)
            || attacksUsed >= (attacker.attackLimit || 1)
            || !attackPermissionMet(attacker)
          ) throw new RulesViolation("invalid-forced-attack");

          const attack = effectiveAttack(state, attacker, attackerOwner);
          const counter = effectiveAttack(state, defender, defenderOwner);
          const defenderRemaining = Math.max(0, effectiveHealth(state, defender, defenderOwner) - (defender.damage || 0));

          attacker.attacksThisTurn = attacksUsed + 1;
          attacker.attackedThisTurn = attacker.attacksThisTurn >= (attacker.attackLimit || 1);
          attacker.participatedInCombatThisTurn = true;
          defender.participatedInCombatThisTurn = true;
          if (!hasKeyword(attacker, /alerta/i) && attacker.attackedThisTurn) attacker.exhausted = true;

          const dealtByAttacker = dealCombatDamage(state, defender, defenderOwner, attacker, attackerOwner, attack);
          const dealtByDefender = dealCombatDamage(state, attacker, attackerOwner, defender, defenderOwner, counter);

          state.pendingDecision = null;
          state.combatAction = null;
          stack.push(...continuation);
          cleanupLethal(state, stack);

          const attackerSurvived = attackerPlayer.board.includes(attacker);
          const defenderDestroyed = !defenderPlayer.board.includes(defender);

          if (hasKeyword(attacker, /atropelar/i) && dealtByAttacker > defenderRemaining) {
            const overflow = dealtByAttacker - defenderRemaining;
            defenderPlayer.life -= overflow;
            if (overflow > 0) stack.push({ kind: "event", event: { type: "onPlayerDamaged", owner: defenderOwner, sourceOwner: attackerOwner, sourceId: attacker.uid, source: attacker, amount: overflow } });
          }
          if (defenderDestroyed && attackerSurvived) stack.push({ kind: "event", event: { type: "onCombatKill", owner: attackerOwner, sourceId: attacker.uid, source: attacker, card: defender } });
          if (dealtByAttacker > 0) {
            stack.push({ kind: "event", event: { type: "onDamageTaken", owner: defenderOwner, targetId: defender.uid, sourceOwner: attackerOwner, sourceId: attacker.uid, amount: dealtByAttacker } });
            stack.push({ kind: "event", event: { type: "onAttachedCreatureDamage", owner: attackerOwner, sourceId: attacker.uid, source: attacker, targetIds: [defender.uid], amount: dealtByAttacker } });
          }
          if (dealtByDefender > 0) {
            stack.push({ kind: "event", event: { type: "onDamageTaken", owner: attackerOwner, targetId: attacker.uid, sourceOwner: defenderOwner, sourceId: defender.uid, amount: dealtByDefender } });
            stack.push({ kind: "event", event: { type: "onAttachedCreatureDamage", owner: defenderOwner, sourceId: defender.uid, source: defender, targetIds: [attacker.uid], amount: dealtByDefender } });
          }
          stack.push({ kind: "event", event: { type: "onCombatDamage", owner: attackerOwner, sourceId: attacker.uid, source: attacker, targetIds: [defender.uid], targetSnapshots: [{ id: defender.uid, owner: defenderOwner, slot: defender.slot }], amount: dealtByAttacker } });
          stack.push({ kind: "event", event: { type: "onAttack", owner: attackerOwner, sourceId: attacker.uid, source: attacker, forced: true } });
          continue;
        }
`;

    source = source.slice(0, start) + replacement + source.slice(end);
    await write(path, source);
  }
}

// ---------------------------------------------------------------------------
// CSS import persistence. ui-gameplay-polish-v6.css owns the new responsive
// evolution/button stack and scrollable card-list dialogs.
// ---------------------------------------------------------------------------
{
  const path = "app/lab.css";
  let source = await read(path);
  const importLine = '@import "./ui-gameplay-polish-v6.css";';
  if (!source.includes(importLine)) {
    const anchor = '@import "./ui-gameplay-motion-v5.css";';
    source = source.includes(anchor)
      ? source.replace(anchor, `${anchor}\n${importLine}`)
      : `${importLine}\n${source}`;
    await write(path, source);
  }
}

console.log("Force-attack combat and responsive UI v7 repair applied.");
