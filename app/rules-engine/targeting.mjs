const folded = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const number = (value, fallback = 1) => ({ uma: 1, um: 1, duas: 2, dois: 2, tres: 3 }[folded(value)] ?? (Number(value) || fallback));

export const TargetScope = Object.freeze({ NONE: "none", ANY_CHARACTER: "anyCharacter", ANY_CREATURE: "anyCreature", ALLY_CREATURE: "allyCreature", ENEMY_CREATURE: "enemyCreature" });

const withSteps = (policy) => ({ ...policy, steps: policy.selections > 0 ? Array.from({ length: policy.selections }, () => ({ scope: policy.scope, role: policy.role || "effect" })) : [] });

export function targetPolicy(cardOrText) {
  const card = typeof cardOrText === "string" ? { text: cardOrText } : cardOrText || {};
  const text = folded(card.text);
  if (/\b(todas?|cada)\b[^.]*\b(criaturas?|constantes?)\b/.test(text)) return { scope: TargetScope.NONE, selections: 0, global: true, steps: [] };
  if (card.type === "Artefato") return withSteps({ scope: TargetScope.ALLY_CREATURE, selections: 1, attachment: true, role: "attachment" });
  const sacrifice = text.match(/\bsacrifique\s+(\d+|uma?|duas?|dois|tres)?[^.]*\bcriatura/);
  if (sacrifice) {
    const sacrificeCount = number(sacrifice[1]);
    const remaining = text.slice(text.indexOf(sacrifice[0]) + sacrifice[0].length).replace(/^[^.]*(?:\.|$)/, "").trim();
    const followUp = remaining ? targetPolicy({ ...card, type: undefined, text: remaining }) : { scope: TargetScope.NONE, selections: 0, steps: [] };
    const sacrificeSteps = Array.from({ length: sacrificeCount }, () => ({ scope: TargetScope.ALLY_CREATURE, role: "sacrifice" }));
    return { scope: TargetScope.ALLY_CREATURE, selections: sacrificeCount + followUp.selections, sacrifice: true, sacrificeCount, steps: [...sacrificeSteps, ...(followUp.steps || [])] };
  }
  const creatureMention = /\bcriaturas?\b/.test(text);
  const amount = number(text.match(/(?:a|em)\s+(\d+|uma?|duas?|dois|tres)\s+criaturas?/)?.[1], 1);
  const enemy = /criaturas?\s+(?:do\s+)?(?:campo\s+)?(?:inimig|adversari)|criaturas?\s+do\s+oponente/.test(text);
  const ally = /criaturas?\s+(?:do\s+)?(?:seu\s+campo|aliad)|sua\s+criatura/.test(text);
  if (creatureMention) return withSteps({ scope: enemy ? TargetScope.ENEMY_CREATURE : ally ? TargetScope.ALLY_CREATURE : TargetScope.ANY_CREATURE, selections: amount });
  if (/\b(cause|causar|cure|restaure|recupere|aumente|alvo)\b/.test(text)) return withSteps({ scope: TargetScope.ANY_CHARACTER, selections: amount });
  if (/\b(destrua|elimine|derrote|bana|banir|sufoc|congel|atordoad|imobiliz|retorne|devolva)\b/.test(text)) return withSteps({ scope: TargetScope.ANY_CREATURE, selections: amount });
  return { scope: TargetScope.NONE, selections: 0, steps: [] };
}

export function isValidTarget(policy, owner, targetOwner, targetKind = "creature") {
  if (policy.scope === TargetScope.NONE) return false;
  if (policy.scope === TargetScope.ANY_CHARACTER) return targetKind === "creature" || targetKind === "hero";
  if (targetKind !== "creature") return false;
  if (policy.scope === TargetScope.ANY_CREATURE) return true;
  if (policy.scope === TargetScope.ALLY_CREATURE) return owner === targetOwner;
  return owner !== targetOwner;
}
