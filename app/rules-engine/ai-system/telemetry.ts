import type { AIGameState, AIChoiceResult, CalibrationCategory, DecisionTelemetry } from "./types";

const normalized = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const textOf = (card: any) => normalized(`${card?.name || ""} ${card?.text || ""} ${(card?.tags || []).join(" ")}`);
export const stableActionKey = (action: Record<string, unknown> | null | undefined): string => {
  if (!action) return "none";
  const ordered = Object.fromEntries(Object.entries(action).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify(ordered);
};

export interface MatchTelemetry {
  matchId: string;
  winner: number | null;
  turns: number;
  players: Array<{ owner: number; difficulty: string; personality: string }>;
}

export interface TelemetrySummary {
  decisions: number;
  matches: number;
  winRateByDifficulty: Record<string, number>;
  averageBeliefEntropy: number;
  averageIterationsPerSecond: number;
  averageEnergyUnused: number;
  averageReserveUnused: number;
  averageOverkill: number;
  averageResponsesHeld: number;
  accuracyByCategory: Record<string, number>;
}

/**
 * Lightweight structured telemetry. It is intentionally storage-agnostic:
 * browser debug tooling can consume the records directly while headless tools
 * can write JSON/CSV without coupling the AI core to a database.
 */
export class AITelemetryCollector {
  readonly decisions: DecisionTelemetry[] = [];
  readonly matches: MatchTelemetry[] = [];
  private acceptableByDecision = new Map<number, boolean>();

  recordDecision(
    state: AIGameState,
    owner: number,
    result: AIChoiceResult,
    matchId: string,
    options: { category?: CalibrationCategory; scenarioId?: string; acceptable?: boolean } = {},
  ): DecisionTelemetry {
    const me = state.players[owner];
    const responseCardsHeld = (me.hand || []).filter((card: any) => /acelerado|destrua|retorne|previna|barreira|cause .*dano/.test(textOf(card))).length;
    const record: DecisionTelemetry = {
      timestamp: Date.now(),
      matchId,
      owner,
      round: Number(state.round || 0),
      phase: String(state.phase || ""),
      difficulty: result.difficulty,
      personality: result.personality,
      actionKey: stableActionKey(result.action),
      evaluation: Number(result.evaluation ?? result.stats.selectedMeanValue ?? 0),
      lethalMargin: Number(result.lethalMargin ?? 0),
      beliefEntropy: Number(result.beliefEntropy ?? result.stats.beliefEntropy ?? 0),
      iterations: Number(result.stats.iterations || 0),
      elapsedMs: Number(result.stats.elapsedMs || 0),
      iterationsPerSecond: Number(result.stats.iterationsPerSecond || (result.stats.elapsedMs > 0 ? result.stats.iterations * 1000 / result.stats.elapsedMs : 0)),
      energyUnused: Number(me.energy || 0),
      reserveUnused: Number(me.reserve || 0),
      responseCardsHeld,
      overkill: Math.max(0, Number(result.lethalMargin || 0)),
      category: options.category,
      scenarioId: options.scenarioId,
    };
    const index = this.decisions.push(record) - 1;
    if (typeof options.acceptable === "boolean") this.acceptableByDecision.set(index, options.acceptable);
    return record;
  }

  recordMatch(match: MatchTelemetry): void {
    this.matches.push(match);
  }

  summary(): TelemetrySummary {
    const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const winStats = new Map<string, { wins: number; games: number }>();
    for (const match of this.matches) {
      for (const player of match.players) {
        const entry = winStats.get(player.difficulty) || { wins: 0, games: 0 };
        entry.games += 1;
        if (match.winner === player.owner) entry.wins += 1;
        winStats.set(player.difficulty, entry);
      }
    }

    const categoryStats = new Map<string, { ok: number; total: number }>();
    this.decisions.forEach((decision, index) => {
      if (!decision.category || !this.acceptableByDecision.has(index)) return;
      const entry = categoryStats.get(decision.category) || { ok: 0, total: 0 };
      entry.total += 1;
      if (this.acceptableByDecision.get(index)) entry.ok += 1;
      categoryStats.set(decision.category, entry);
    });

    return {
      decisions: this.decisions.length,
      matches: this.matches.length,
      winRateByDifficulty: Object.fromEntries([...winStats].map(([key, value]) => [key, value.games ? value.wins / value.games : 0])),
      averageBeliefEntropy: average(this.decisions.map((item) => item.beliefEntropy)),
      averageIterationsPerSecond: average(this.decisions.map((item) => item.iterationsPerSecond)),
      averageEnergyUnused: average(this.decisions.map((item) => item.energyUnused)),
      averageReserveUnused: average(this.decisions.map((item) => item.reserveUnused)),
      averageOverkill: average(this.decisions.map((item) => item.overkill)),
      averageResponsesHeld: average(this.decisions.map((item) => item.responseCardsHeld)),
      accuracyByCategory: Object.fromEntries([...categoryStats].map(([key, value]) => [key, value.total ? value.ok / value.total : 0])),
    };
  }

  toCSV(): string {
    const columns: Array<keyof DecisionTelemetry> = [
      "timestamp", "matchId", "owner", "round", "phase", "difficulty", "personality", "actionKey",
      "evaluation", "lethalMargin", "beliefEntropy", "iterations", "elapsedMs", "iterationsPerSecond",
      "energyUnused", "reserveUnused", "responseCardsHeld", "overkill", "category", "scenarioId",
    ];
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    return [columns.join(","), ...this.decisions.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n");
  }
}
