import { readFile } from "node:fs/promises";
import { auditCards, compileCard } from "../app/rules-engine/compiler.mjs";
import { canExecuteCard } from "../app/rules-engine/engine.mjs";

const cards = JSON.parse(await readFile(new URL("../app/cards.generated.json", import.meta.url), "utf8"));
const compiled = cards.map(compileCard);
const report = auditCards(cards);
const unsupported = compiled.filter((card) => card.diagnostics.unsupported).map((card) => ({ page: card.page, id: card.id, name: card.name, unsupported: card.diagnostics.unsupported }));
const ignoredWithText = compiled.filter((card) => card.diagnostics?.ignored && String(card.text || "").trim()).map((card) => ({ page: card.page, id: card.id, name: card.name, reason: card.diagnostics?.reason || "ignored" }));
const activeCards = compiled.filter((card) => !card.diagnostics?.ignored);
const nonExecutable = activeCards.filter((card) => !canExecuteCard(card)).map((card) => ({ page: card.page, id: card.id, name: card.name, effects: [...new Set((card.abilities || []).flatMap((ability) => (ability.effects || []).map((effect) => effect.type)))] }));

console.log(JSON.stringify({ ...report, activeCards: activeCards.length, executable: activeCards.length - nonExecutable.length, nonExecutable, ignoredWithText, unsupportedCards: unsupported }, null, 2));
if (report.issues.some((issue) => issue.severity === "error") || nonExecutable.length) process.exitCode = 1;
