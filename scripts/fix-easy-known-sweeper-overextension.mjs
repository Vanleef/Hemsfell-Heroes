import { readFile, writeFile } from "node:fs/promises";

const controllerPath = "app/rules-engine/ai-system/controller.ts";
let controller = await readFile(controllerPath, "utf8");

const actionPriority = 'const actionPriority = (action: AIAction) => action.type === "attack" ? 0 : action.type === "activate" || action.type === "activateHero" ? 1 : action.type === "playCard" ? 2 : action.type === "resolveDecision" ? 3 : action.type === "evolveHero" ? 4 : action.type === "passPriority" ? 5 : 6;\n';
const publicSweepHelper = `${actionPriority}const publiclyRepresentedSweep = (state: AIGameState, owner: number): boolean => {\n  const opponent = state.players[1 - owner];\n  return (opponent?.hand || []).some((card: any) => {\n    const visible = !!card?.revealed || (Array.isArray(card?.revealedTo) && card.revealedTo.includes(owner));\n    return visible && /todas? .*criaturas|cada criatura|todas? .*unidades/.test(cardText(card));\n  });\n};\n`;
if (!controller.includes(actionPriority)) throw new Error("controller actionPriority patch point missing");
controller = controller.replace(actionPriority, publicSweepHelper);

const oldEasyRanking = `        }).sort((a, b) => b.score - a.score);\n        const best = ranked[0];\n        const mistake = this.random() < config.intentionalErrorRate;\n        const beforeBoard = planningState.players[owner]?.board?.length || 0;\n        const mistakeWindow = Math.max(5, Math.abs(Number(best?.score || 0)) * 0.14);\n        const plausibleMistakes = ranked.slice(1).filter((entry) => {\n          if (!entry.next || !Number.isFinite(entry.score) || entry.score < Number(best?.score || -Infinity) - mistakeWindow) return false;\n          const afterBoard = entry.next.players[owner]?.board?.length || 0;\n          const recklessOverextension = afterBoard > beforeBoard && !this.risk.shouldOverextend(planningState, owner, personality);\n          return !recklessOverextension;\n        });`;
const newEasyRanking = `        }).sort((a, b) => b.score - a.score);\n        const beforeBoard = planningState.players[owner]?.board?.length || 0;\n        const publicSweepThreat = publiclyRepresentedSweep(state, owner);\n        const isRecklessOverextension = (entry: { action: AIAction; score: number; next: AIGameState | null }) => {\n          if (!entry.next) return false;\n          const afterBoard = entry.next.players[owner]?.board?.length || 0;\n          return afterBoard > beforeBoard && !this.risk.shouldOverextend(planningState, owner, personality);\n        };\n        // Easy may make plausible human mistakes, but it must not rank a known\n        // board-clear punt as its baseline choice. Hidden sweep hypotheses stay\n        // probabilistic; this hard guard only applies to a publicly revealed one.\n        const baselineRanked = publicSweepThreat ? ranked.filter((entry) => !isRecklessOverextension(entry)) : ranked;\n        const best = baselineRanked[0] || ranked[0];\n        const mistake = this.random() < config.intentionalErrorRate;\n        const mistakeWindow = Math.max(5, Math.abs(Number(best?.score || 0)) * 0.14);\n        const plausibleMistakes = ranked.filter((entry) => actionKey(entry.action) !== actionKey(best?.action)).filter((entry) => {\n          if (!entry.next || !Number.isFinite(entry.score) || entry.score < Number(best?.score || -Infinity) - mistakeWindow) return false;\n          return !isRecklessOverextension(entry);\n        });`;
if (!controller.includes(oldEasyRanking)) throw new Error("Easy ranking patch point missing");
controller = controller.replace(oldEasyRanking, newEasyRanking);
await writeFile(controllerPath, controller);

const testPath = "tests/advanced-ai.test.mjs";
let test = await readFile(testPath, "utf8");
const oldAssertions = `  assert.match(controller, /plausibleMistakes/);\n  assert.match(controller, /recklessOverextension/);\n  assert.match(controller, /plausibilityScore/);\n`;
const newAssertions = `  assert.match(controller, /plausibleMistakes/);\n  assert.match(controller, /isRecklessOverextension/);\n  assert.match(controller, /publiclyRepresentedSweep/);\n  assert.match(controller, /publicSweepThreat/);\n  assert.match(controller, /baselineRanked/);\n  assert.match(controller, /plausibilityScore/);\n`;
if (!test.includes(oldAssertions)) throw new Error("advanced AI safety contract patch point missing");
test = test.replace(oldAssertions, newAssertions);
await writeFile(testPath, test);
