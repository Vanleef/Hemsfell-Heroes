import { AIController } from "./controller";
import { CALIBRATION_CORPUS, calibrationAdapter } from "./calibration";
import { AITelemetryCollector, stableActionKey } from "./telemetry";
import type { AIDifficulty, CalibrationResult } from "./types";

export interface CalibrationRunOptions {
  difficulties?: AIDifficulty[];
  scenarioIds?: string[];
  repeats?: number;
  onProgress?: (completed: number, total: number) => void;
}

export interface CalibrationRunReport {
  results: CalibrationResult[];
  telemetry: AITelemetryCollector;
  accuracy: number;
  accuracyByDifficulty: Record<string, number>;
  accuracyByCategory: Record<string, number>;
}

const ratioMap = (results: CalibrationResult[], key: (result: CalibrationResult) => string) => {
  const buckets = new Map<string, { ok: number; total: number }>();
  for (const result of results) {
    const name = key(result);
    const bucket = buckets.get(name) || { ok: 0, total: 0 };
    bucket.total += 1;
    if (result.acceptable) bucket.ok += 1;
    buckets.set(name, bucket);
  }
  return Object.fromEntries([...buckets].map(([name, bucket]) => [name, bucket.total ? bucket.ok / bucket.total : 0]));
};

/** Execute the fixed strategic corpus against real AIController instances. */
export async function runCalibrationCorpus(options: CalibrationRunOptions = {}): Promise<CalibrationRunReport> {
  const difficulties = options.difficulties || ["Easy", "Normal", "Hard", "Expert", "Master"];
  const wanted = options.scenarioIds?.length ? new Set(options.scenarioIds) : null;
  const scenarios = CALIBRATION_CORPUS.filter((scenario) => !wanted || wanted.has(scenario.id));
  const repeats = Math.max(1, options.repeats || 1);
  const total = difficulties.length * scenarios.length * repeats;
  const results: CalibrationResult[] = [];
  const telemetry = new AITelemetryCollector();
  let completed = 0;

  for (const difficulty of difficulties) {
    for (const scenario of scenarios) {
      for (let repeat = 0; repeat < repeats; repeat += 1) {
        const controller = new AIController(difficulty, calibrationAdapter(scenario));
        const result = await controller.chooseAction(structuredClone(scenario.state), scenario.owner);
        const chosenActionKey = stableActionKey(result.action);
        const acceptable = scenario.acceptableActionKeys.includes(chosenActionKey);
        const item: CalibrationResult = {
          scenarioId: scenario.id,
          category: scenario.category,
          difficulty,
          personality: result.personality,
          chosenActionKey,
          acceptable,
          evaluation: Number(result.evaluation || 0),
          lethalMargin: Number(result.lethalMargin || 0),
          beliefEntropy: Number(result.beliefEntropy || 0),
          elapsedMs: Number(result.stats.elapsedMs || 0),
          iterations: Number(result.stats.iterations || 0),
        };
        results.push(item);
        telemetry.recordDecision(scenario.state, scenario.owner, result, `calibration-${difficulty}-${scenario.id}-${repeat}`, { category: scenario.category, scenarioId: scenario.id, acceptable });
        completed += 1;
        options.onProgress?.(completed, total);
      }
    }
  }

  return {
    results,
    telemetry,
    accuracy: results.length ? results.filter((result) => result.acceptable).length / results.length : 0,
    accuracyByDifficulty: ratioMap(results, (result) => result.difficulty),
    accuracyByCategory: ratioMap(results, (result) => result.category),
  };
}
