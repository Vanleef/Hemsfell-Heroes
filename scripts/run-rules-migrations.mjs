import { spawnSync } from "node:child_process";

const steps = [
  "normalize-rules-migration-inputs.mjs",
  "fix-artifact-activation-runtime.mjs",
  "repair-card-semantics-migration.mjs",
  "prepare-card-semantics-v2.mjs",
  "apply-card-semantics-v2.mjs",
  "apply-card-semantics-v2-followup.mjs",
  "fix-fura-variable-definitions.mjs",
  "apply-gameplay-polish-v3.mjs",
  "apply-ui-rules-polish-v4.mjs",
  "apply-ui-interaction-polish-v5.mjs",
  "repair-authoritative-rules-v6.mjs",
  "repair-force-attack-ui-v7.mjs",
  "repair-ui-board-v8.mjs",
  "repair-ui-board-v9.mjs",
  "repair-ui-board-v10.mjs",
  "repair-ui-board-v11.mjs",
];

for (const step of steps) {
  const result = spawnSync(process.execPath, [new URL(step, import.meta.url)], {
    stdio: "inherit",
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
