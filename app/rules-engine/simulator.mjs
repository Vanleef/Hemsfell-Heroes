import { RulesLoopError } from "./engine.mjs";
import { chooseAIResponse, shouldAutoPass } from "./priority.mjs";

export const seededRandom = (seed = 1) => () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let value = Math.imul(seed ^ seed >>> 15, 1 | seed); value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value; return ((value ^ value >>> 14) >>> 0) / 4294967296; };

export function runHeadlessGames({ games = 1000, maxTurns = 200, seed = 1, createGame, chooseCommand, execute }) {
  const random = seededRandom(seed); const report = { games, completed: 0, draws: 0, softlocks: 0, errors: [], wins: [0, 0], turns: 0, commands: 0 };
  for (let gameIndex = 0; gameIndex < games; gameIndex += 1) {
    let state = createGame(random, gameIndex); const seen = new Map(); let finished = false;
    for (let turn = 0; turn < maxTurns; turn += 1) {
      const key = JSON.stringify({ active: state.active, phase: state.phase, life: state.players.map((p) => p.life), zones: state.players.map((p) => [p.deck.length, p.hand.length, p.board.length, p.grave.length]) });
      const repetitions = (seen.get(key) || 0) + 1; seen.set(key, repetitions); if (repetitions > 8) { report.softlocks += 1; finished = true; break; }
      const command = chooseCommand(state, random); if (!command) { report.draws += 1; finished = true; break; }
      try { state = execute(state, command).state; report.commands += 1; } catch (error) { if (error instanceof RulesLoopError) report.softlocks += 1; else report.errors.push({ game: gameIndex, turn, message: error.message }); finished = true; break; }
      const winner = state.players.findIndex((player) => player.life <= 0 || player.deckOut); if (winner >= 0) { report.wins[1 - winner] += 1; report.completed += 1; finished = true; break; }
      report.turns += 1;
    }
    if (!finished) report.draws += 1;
  }
  return { ...report, averageTurns: report.games ? report.turns / report.games : 0 };
}

/** Uses the same legal-response policy as the browser and online rules path. */
export function chooseHeadlessPriorityCommand(state, owner, random = Math.random, control = "assisted") {
  if (!state?.pendingResponse || state.pendingResponse.responder !== owner) return null;
  if (shouldAutoPass(state, owner, control)) return { type: "passPriority", owner, auto: true };
  return chooseAIResponse(state, owner, random);
}
