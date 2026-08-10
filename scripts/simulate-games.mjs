import { readFile } from "node:fs/promises";
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { runHeadlessGames } from "../app/rules-engine/simulator.mjs";

const cards = JSON.parse(await readFile(new URL("../app/cards.generated.json", import.meta.url), "utf8"));
const pool = cards.filter((card) => !card.hero && !card.imageCard).map(compileCard);
const value = (name, fallback) => Number(process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] || fallback);
const games = value("games", 1000); const seed = value("seed", 20260810); const maxTurns = value("turns", 200);

const createGame = (random) => ({
  active: 0, phase: "manutencao", round: 1,
  players: [0, 1].map(() => {
    const deck = Array.from({ length: 49 }, () => structuredClone(pool[Math.floor(random() * pool.length)]));
    return { life: 30, maxLife: 30, energy: 1, maxEnergy: 1, reserve: 0, deck: deck.slice(7), hand: deck.slice(0, 7), board: [], support: [], terrain: null, grave: [], obscuro: [] };
  }),
});

const chooseCommand = (state, random) => {
  const owner = state.active; const entry = state.players[owner];
  if (state.phase === "principal") {
    const playable = entry.hand.filter((card) => card.cost <= entry.energy + (card.type === "Feitiço" ? entry.reserve : 0));
    if (playable.length && random() < 0.7) { const card = playable[Math.floor(random() * playable.length)]; return { type: "playCard", owner, cardId: card.id, slot: Math.min(4, entry.board.length), targetIds: state.players[1 - owner].board.slice(0, 1).map((unit) => unit.uid) }; }
  }
  if (state.phase === "combate") {
    const attacker = entry.board.find((unit) => !unit.exhausted && !unit.summoning && !unit.stunned);
    if (attacker) { const defender = state.players[1 - owner].board.find((unit) => !unit.exhausted && !unit.stunned); return { type: "attack", owner, attackerId: attacker.uid, defenderId: defender?.uid }; }
  }
  return { type: "advancePhase" };
};

const execute = (state, command) => {
  const result = executeCommand(state, command); const next = result.state;
  if (command.type === "advancePhase" && next.phase === "manutencao") {
    const entry = next.players[next.active]; entry.board.forEach((unit) => { unit.exhausted = false; unit.summoning = false; unit.damage = 0; }); entry.maxEnergy = Math.min(10, entry.maxEnergy + 1); entry.energy = entry.maxEnergy;
    const card = entry.deck.shift(); if (card) entry.hand.push(card); else entry.deckOut = true;
  }
  return result;
};

console.log(JSON.stringify(runHeadlessGames({ games, maxTurns, seed, createGame, chooseCommand, execute }), null, 2));
