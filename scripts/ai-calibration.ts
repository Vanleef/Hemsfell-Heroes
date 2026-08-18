import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runCalibrationCorpus } from "../app/rules-engine/ai-system/calibration-runner";
import type { AIDifficulty } from "../app/rules-engine/ai-system/types";

const arg = (name: string) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const allowed: AIDifficulty[] = ["Easy", "Normal", "Hard", "Expert", "Master"];

async function main() {
  const requested = (arg("difficulty") || allowed.join(",")).split(",").filter((item): item is AIDifficulty => allowed.includes(item as AIDifficulty));
  const scenarioIds = arg("scenarios")?.split(",").filter(Boolean);
  const repeats = Math.max(1, Number(arg("repeats") || 1));
  const seed = Number(arg("seed") || 20260818);
  const outDir = resolve(arg("out") || "reports/ai");
  const started = Date.now();
  let lastPercent = -1;

  const report = await runCalibrationCorpus({
    difficulties: requested,
    scenarioIds,
    repeats,
    seed,
    onProgress: (completed, total) => {
      const percent = Math.floor(completed * 100 / Math.max(1, total));
      if (percent !== lastPercent && (percent % 5 === 0 || completed === total)) {
        process.stdout.write(`[ai-calibration] ${completed}/${total} (${percent}%)\n`);
        lastPercent = percent;
      }
    },
  });

  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const summary = {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    seed: report.seed,
    scenarios: new Set(report.results.map((item) => item.scenarioId)).size,
    runs: report.results.length,
    accuracy: report.accuracy,
    accuracyByDifficulty: report.accuracyByDifficulty,
    accuracyByCategory: report.accuracyByCategory,
    accuracyByDifficultyAndCategory: report.accuracyByDifficultyAndCategory,
    telemetry: report.telemetry.summary(),
  };

  await writeFile(resolve(outDir, `calibration-${stamp}.json`), JSON.stringify({ summary, results: report.results }, null, 2));
  await writeFile(resolve(outDir, `calibration-${stamp}.csv`), report.telemetry.toCSV());
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
