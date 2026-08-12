import { writeFile } from "node:fs/promises";
import rawCards from "../app/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { canExecuteCard } from "../app/rules-engine/engine.mjs";

const uniq = (values) => [...new Set(values.filter(Boolean))];
const fold = (value = "") => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

const implementationRisks = (card) => {
  const risks = [];
  const effects = (card.abilities || []).flatMap((ability) => ability.effects || []);
  const effectTypes = effects.map((effect) => effect.type);
  const text = fold(card.text);

  // Conditional Draconic Image upgrades are implemented by replaceImage: the
  // engine creates the larger Image normally when no eligible smaller Image
  // exists, and opens an authoritative target decision when one does.

  if (card.diagnostics?.source === "text" && card.diagnostics?.unsupported > 0) {
    risks.push({ severity: "high", code: "unsupported-parser-effect", detail: `${card.diagnostics.unsupported} efeito(s) não suportado(s) pelo compilador textual.` });
  }
  if (!card.diagnostics?.ignored && !canExecuteCard(card)) {
    risks.push({ severity: "high", code: "non-executable", detail: "A carta possui ao menos um efeito que o motor canônico não considera executável." });
  }
  if (card.diagnostics?.source === "text" && /\b(se|caso|enquanto|quando|sempre que|uma vez por turno|no inicio|no início|no fim)\b/.test(text)) {
    risks.push({ severity: "review", code: "text-parser-conditional", detail: "Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso." });
  }
  if (card.diagnostics?.source === "text" && /\b(alvo|escolha|selecione|substitua|troque)\b/.test(text)) {
    risks.push({ severity: "review", code: "text-parser-targeting", detail: "Seleção de alvo depende do parser textual; revisar escopo, opcionalidade e quantidade de alvos." });
  }
  if (/reduz\w*.*custo|custa? .* a menos/.test(text) && !effectTypes.some((type) => /cost/i.test(type)) && ![13,14,42,88,139,149,203,224].includes(card.page)) {
    risks.push({ severity: "review", code: "cost-reduction-outside-effect-data", detail: "O texto menciona redução de custo, mas o efeito compilado não expõe um primitivo de custo; verificar se existe tratamento especial em outra camada." });
  }
  return risks;
};

const rows = rawCards.map((raw) => {
  const card = compileCard(raw);
  const abilities = card.abilities || [];
  const effects = abilities.flatMap((ability) => ability.effects || []);
  const costs = abilities.flatMap((ability) => ability.costs || []);
  const risks = implementationRisks(card);
  return {
    page: card.page,
    id: card.id,
    name: card.name,
    type: card.type,
    cost: card.cost,
    hero: !!card.hero,
    imageCard: !!card.imageCard,
    implementation: card.diagnostics?.ignored ? "ignored" : card.diagnostics?.source || "unknown",
    ignoredReason: card.rules?.reason || null,
    executable: card.diagnostics?.ignored ? false : canExecuteCard(card),
    unsupported: card.diagnostics?.unsupported || 0,
    triggers: uniq(abilities.map((ability) => ability.trigger)),
    effectTypes: uniq(effects.map((effect) => effect.type)),
    costTypes: uniq(costs.map((cost) => cost.type)),
    targetEffects: effects.filter((effect) => effect.target || effect.selections).map((effect) => ({ type: effect.type, target: effect.target || null, selections: effect.selections ?? null, requiredSubtype: effect.requiredSubtype || null })),
    printedText: card.text || "",
    risks,
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  totalCards: rows.length,
  activeCards: rows.filter((row) => row.implementation !== "ignored").length,
  ignoredCards: rows.filter((row) => row.implementation === "ignored").length,
  explicitCards: rows.filter((row) => row.implementation === "explicit").length,
  textParsedCards: rows.filter((row) => row.implementation === "text").length,
  executableCards: rows.filter((row) => row.executable).length,
  unsupportedCards: rows.filter((row) => row.unsupported > 0).length,
  cardsWithRisks: rows.filter((row) => row.risks.length > 0).length,
  confirmedFindings: rows.flatMap((row) => row.risks.filter((risk) => risk.severity === "confirmed").map((risk) => ({ page: row.page, name: row.name, ...risk }))),
};

const severityRank = { confirmed: 0, high: 1, review: 2 };
const reviewRows = rows
  .filter((row) => row.risks.length)
  .sort((a, b) => Math.min(...a.risks.map((risk) => severityRank[risk.severity] ?? 9)) - Math.min(...b.risks.map((risk) => severityRank[risk.severity] ?? 9)) || a.page - b.page);

const md = [
  "# Hemsfell Heroes — auditoria de implementação das cartas",
  "",
  "> Gerado por `node scripts/export-card-implementation-audit.mjs` a partir de `cards.generated.json` e do compilador/motor atuais.",
  "",
  "## Resumo",
  "",
  `- Total de cartas: **${summary.totalCards}**`,
  `- Ativas: **${summary.activeCards}**`,
  `- Regras explícitas: **${summary.explicitCards}**`,
  `- Regras derivadas do texto: **${summary.textParsedCards}**`,
  `- Executáveis pelo motor canônico: **${summary.executableCards}**`,
  `- Com efeito textual não suportado: **${summary.unsupportedCards}**`,
  `- Marcadas para revisão: **${summary.cardsWithRisks}**`,
  "",
  "## Achados confirmados / revisão prioritária",
  "",
  ...reviewRows.flatMap((row) => [
    `### ${row.page}. ${row.name}`,
    "",
    `Implementação: **${row.implementation}** · Executável: **${row.executable ? "sim" : "não"}** · Gatilhos: ${row.triggers.join(", ") || "—"} · Efeitos: ${row.effectTypes.join(", ") || "—"}`,
    "",
    ...row.risks.map((risk) => `- **${risk.severity.toUpperCase()} · ${risk.code}:** ${risk.detail}`),
    "",
  ]),
  "## Inventário completo",
  "",
  "| Pág. | Carta | Tipo | Implementação | Executável | Gatilhos | Efeitos |",
  "|---:|---|---|---|:---:|---|---|",
  ...rows.map((row) => `| ${row.page} | ${row.name.replace(/\|/g, "\\|")} | ${row.type} | ${row.implementation} | ${row.executable ? "✓" : "—"} | ${row.triggers.join(", ") || "—"} | ${row.effectTypes.join(", ") || "—"} |`),
  "",
  "## Como interpretar",
  "",
  "- `explicit`: a carta possui definição canônica em `rules-engine/card-rules.mjs`.",
  "- `text`: a implementação foi inferida automaticamente do texto impresso pelo compilador.",
  "- `ignored`: removida/ignorada explicitamente pelo conjunto de regras atual.",
  "- `review` não significa necessariamente bug; indica que a semântica impressa merece comparação manual com o comportamento do motor.",
  "",
].join("\n");

await writeFile(new URL("../docs/card-implementation-audit.json", import.meta.url), JSON.stringify({ summary, cards: rows }, null, 2));
await writeFile(new URL("../docs/card-implementation-audit.md", import.meta.url), md);
console.log(JSON.stringify(summary, null, 2));
