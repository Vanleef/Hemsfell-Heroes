import { readFile } from "node:fs/promises";
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { canExecuteCard, executeCommand } from "../app/rules-engine/engine.mjs";
import { canEndCombat, listAttackCapableCreatures, listLegalBlockers, listPendingIndomitableAttackers } from "../app/rules-engine/combat.mjs";
import { runHeadlessGames } from "../app/rules-engine/simulator.mjs";
import { isValidTarget, targetPolicy } from "../app/rules-engine/targeting.mjs";

const cards = JSON.parse(await readFile(new URL("../app/data/catalog/cards.generated.json", import.meta.url), "utf8")).map(compileCard);
const pool = cards.filter((card) => !card.hero && !card.imageCard && canExecuteCard(card));
const imagePool = cards.filter((card) => card.imageCard);
const value = (name, fallback) => Number(process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] || fallback);
const games = value("games", 1000); const seed = value("seed", 20260810); const maxTurns = value("turns", 200);

const createGame = (random) => ({
  active: 0, phase: "manutencao", round: 1,
  players: [0, 1].map(() => {
    const deck = Array.from({ length: 49 }, (_, index) => ({ ...structuredClone(pool[Math.floor(random() * pool.length)]), simulationCopy: index }));
    return { life: 30, maxLife: 30, energy: 1, maxEnergy: 1, reserve: 0, deck: deck.slice(7), hand: deck.slice(0, 7), extraDeck: structuredClone(imagePool), board: [], support: [], terrain: null, grave: [], obscuro: [], abilityUses: {} };
  }),
});

const permanents = (entry) => [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])];
const kindOf = (entry, card) => entry.board.includes(card) || card.type === "Criatura" ? "creature" : "permanent";
const candidatesFor = (state, owner, step) => {
  const choices = [];
  state.players.forEach((entry, targetOwner) => {
    for (const card of permanents(entry)) if (isValidTarget(step, owner, targetOwner, kindOf(entry, card))) choices.push(card.uid);
  });
  for (const targetOwner of [0, 1]) if (isValidTarget(step, owner, targetOwner, "hero")) choices.push(targetOwner === owner ? "ally-hero" : "enemy-hero");
  return choices;
};
const freeSlot = (zone) => Array.from({ length: 5 }, (_, slot) => slot).find((slot) => !zone.some((card) => card.slot === slot));

function playCommand(state, owner, card, random) {
  const entry = state.players[owner]; const policy = targetPolicy(card);
  const effectSteps = (policy.steps || []).filter((step) => !["sacrifice", "attachment"].includes(step.role));
  const targetIds = [];
  for (const step of effectSteps) {
    const choices = candidatesFor(state, owner, step);
    if (!choices.length) {
      if (card.type === "Criatura") continue;
      return null;
    }
    const unused = choices.filter((id) => !targetIds.includes(id));
    const source = unused.length ? unused : choices;
    targetIds.push(source[Math.floor(random() * source.length)]);
  }
  const sacrificeCost = (card.abilities || []).filter((ability) => ability.trigger === "onPlay").flatMap((ability) => ability.costs || []).find((cost) => cost.type === "sacrifice");
  const sacrificeIds = sacrificeCost ? entry.board.slice(0, sacrificeCost.amount).map((unit) => unit.uid) : [];
  if (sacrificeCost && sacrificeIds.length < sacrificeCost.amount) return null;

  const command = { type: "playCard", owner, cardId: card.id, targetIds, sacrificeIds };
  const remains = card.type !== "Feitiço" || (card.abilities || []).some((ability) => (ability.effects || []).some((effect) => effect.type === "remainUntilTurnEnd"));
  if (card.type === "Criatura") {
    const slot = freeSlot(entry.board); if (slot == null) return null; command.slot = slot;
  } else if (card.type === "Artefato" && card.page !== 304) {
    const hosts = entry.board.filter((host) => !entry.support.some((support) => support.attachedTo === host.uid));
    if (!hosts.length) return null; const host = hosts[Math.floor(random() * hosts.length)]; command.slot = host.slot; command.attachedTo = host.uid;
  } else if (card.type === "Terreno") command.slot = 0;
  else if (remains) { const slot = freeSlot(entry.support); if (slot == null) return null; command.slot = slot; }
  return command;
}

const legal = (state, command) => { try { executeCommand(state, command); return true; } catch { return false; } };

const chooseCommand = (state, random) => {
  if (state.pendingResponse) return { type: "passPriority", owner: state.pendingResponse.responder };

  if (state.combatAction?.stage === "choosing") {
    const owner = 1 - state.combatAction.attackerOwner;
    const blockers = listLegalBlockers(state, owner, state.combatAction.attackerUid);
    const chosen = blockers.length && random() < .72 ? blockers[Math.floor(random() * blockers.length)] : null;
    return { type: "selectDefender", owner, attackerId: state.combatAction.attackerUid, ...(chosen ? { defenderId: chosen.uid, targetHero: false } : { targetHero: true }) };
  }

  if (state.combatAction?.stage === "charging") {
    const combat = state.combatAction;
    return { type: "attack", owner: combat.attackerOwner, attackerId: combat.attackerUid, ...(combat.defenderUid ? { defenderId: combat.defenderUid } : {}), skipPriority: true };
  }

  const owner = state.active; const entry = state.players[owner];
  if (state.phase === "principal") {
    const affordable = entry.hand.filter((card) => canExecuteCard(card) && card.cost <= entry.energy + (card.type === "Feitiço" ? entry.reserve : 0));
    const ordered = [...affordable].sort(() => random() - 0.5);
    for (const card of ordered) {
      const command = playCommand(state, owner, card, random);
      if (command && legal(state, command) && random() < 0.75) return command;
    }
  }

  if (state.phase === "combate") {
    const mandatory = listPendingIndomitableAttackers(state, owner);
    const attackers = mandatory.length ? mandatory : listAttackCapableCreatures(state, owner).sort(() => random() - 0.5);
    if (attackers.length && (mandatory.length || random() < .78)) return { type: "declareAttack", owner, attackerId: attackers[0].uid || attackers[0].id };
    if (!canEndCombat(state, owner)) return attackers[0] ? { type: "declareAttack", owner, attackerId: attackers[0].uid || attackers[0].id } : null;
  }

  const advance = { type: "advancePhase", owner };
  return legal(state, advance) ? advance : null;
};

const execute = (state, command) => {
  const result = executeCommand(state, command); const next = result.state;
  if (command.type === "advancePhase" && next.phase === "manutencao") {
    const entry = next.players[next.active];
    entry.maxEnergy = Math.min(10, entry.maxEnergy + 1); entry.energy = entry.maxEnergy;
    const card = entry.deck.shift(); if (card) entry.hand.push(card); else entry.deckOut = true;
  }
  return result;
};

console.log(JSON.stringify(runHeadlessGames({ games, maxTurns, seed, createGame, chooseCommand, execute }), null, 2));
