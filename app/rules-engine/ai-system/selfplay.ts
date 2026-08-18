import { AIController } from "./controller";
import { AITelemetryCollector } from "./telemetry";
import type { AIDifficulty, AIGameState, EngineAdapter } from "./types";

export interface SelfPlayPlayerSpec {
  difficulty: AIDifficulty;
  label?: string;
}

export interface SelfPlayOptions {
  games: number;
  maxPlies?: number;
  seed?: number;
  players: [SelfPlayPlayerSpec, SelfPlayPlayerSpec];
  adapter: EngineAdapter;
  createState: (gameIndex: number, random: () => number, players: [SelfPlayPlayerSpec, SelfPlayPlayerSpec]) => AIGameState;
  onProgress?: (completed: number, games: number) => void;
}

export interface SelfPlayBatchResult {
  telemetry: AITelemetryCollector;
  wins: [number, number];
  draws: number;
  averagePlies: number;
}

const mulberry32 = (seed: number) => () => {
  let value = seed += 0x6D2B79F5;
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
};

const actorFor = (state: AIGameState): number => {
  const pending = state.pendingDecision as any;
  if (typeof pending?.context?.decisionOwner === "number") return pending.context.decisionOwner;
  if (typeof pending?.owner === "number") return pending.owner;
  if (typeof state.pendingResponse?.responder === "number") return state.pendingResponse.responder;
  return Number(state.active || 0);
};

const publicObservations = (before: AIGameState, after: AIGameState, actor: number, action: Record<string, unknown>) => {
  const observations: Array<{ type: "play" | "draw"; player: number; cardId?: string; card?: any; count?: number; round?: number }> = [];
  if (action.type === "playCard" && typeof action.cardId === "string") {
    const card = before.players[actor]?.hand?.find((candidate: any) => candidate.id === action.cardId || candidate.uid === action.cardId);
    observations.push({ type: "play", player: actor, cardId: action.cardId, card, round: before.round });
  }
  const beforeDeck = Number(before.players[actor]?.deck?.length || 0);
  const afterDeck = Number(after.players[actor]?.deck?.length || 0);
  if (afterDeck < beforeDeck) observations.push({ type: "draw", player: actor, count: beforeDeck - afterDeck, round: after.round });
  return observations;
};

/**
 * Headless AI-vs-AI runner using the same AIController and EngineAdapter as the
 * game client. It intentionally owns no card rules; the authoritative adapter
 * remains the only source of legal actions and state transitions.
 */
export async function runSelfPlayBatch(options: SelfPlayOptions): Promise<SelfPlayBatchResult> {
  const random = mulberry32(options.seed ?? 20260818);
  const telemetry = new AITelemetryCollector();
  const wins: [number, number] = [0, 0];
  let draws = 0;
  let totalPlies = 0;
  const maxPlies = options.maxPlies ?? 240;

  for (let gameIndex = 0; gameIndex < options.games; gameIndex += 1) {
    let state = options.createState(gameIndex, random, options.players);
    const controllers: [AIController, AIController] = [
      new AIController(options.players[0].difficulty, options.adapter),
      new AIController(options.players[1].difficulty, options.adapter),
    ];
    const matchId = `selfplay-${options.seed ?? 20260818}-${gameIndex}`;
    let plies = 0;

    while (state.winner == null && plies < maxPlies) {
      const actor = actorFor(state);
      const controller = controllers[actor];
      const result = await controller.chooseAction(state, actor);
      telemetry.recordDecision(state, actor, result, matchId);
      if (!result.action) break;

      const before = state;
      try { state = options.adapter.applyAction(before, result.action); }
      catch { break; }

      for (const observation of publicObservations(before, state, actor, result.action)) {
        controllers[1 - actor].observe(observation);
      }
      plies += 1;
    }

    totalPlies += plies;
    if (state.winner === 0 || state.winner === 1) wins[state.winner] += 1;
    else draws += 1;
    telemetry.recordMatch({
      matchId,
      winner: state.winner === 0 || state.winner === 1 ? state.winner : null,
      turns: Number(state.round || 0),
      players: options.players.map((player, owner) => ({ owner, difficulty: player.difficulty, personality: state.players[owner]?.heroId || player.label || "unknown" })),
    });
    options.onProgress?.(gameIndex + 1, options.games);
  }

  return { telemetry, wins, draws, averagePlies: options.games ? totalPlies / options.games : 0 };
}
