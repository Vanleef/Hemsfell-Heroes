import { readFile } from "node:fs/promises";
import { auditCards, compileCard } from "../app/rules-engine/compiler.mjs";

const cards = JSON.parse(await readFile(new URL("../app/cards.generated.json", import.meta.url), "utf8"));
const compiled = cards.map(compileCard);
const report = auditCards(cards);
const unsupported = compiled.filter((card) => card.diagnostics.unsupported).map((card) => ({ page: card.page, id: card.id, name: card.name, unsupported: card.diagnostics.unsupported }));

console.log(JSON.stringify({ ...report, unsupportedCards: unsupported }, null, 2));
if (report.issues.some((issue) => issue.severity === "error")) process.exitCode = 1;
