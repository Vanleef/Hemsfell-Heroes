const folded = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const number = (value, fallback = 1) => ({ uma: 1, um: 1, duas: 2, dois: 2, tres: 3 }[folded(value)] ?? (Number(value) || fallback));

export const TargetScope = Object.freeze({ NONE: "none", ANY_CHARACTER: "anyCharacter", ANY_CREATURE: "anyCreature", ALLY_CREATURE: "allyCreature", ENEMY_CREATURE: "enemyCreature", ANY_PERMANENT: "anyPermanent", ALLY_PERMANENT: "allyPermanent", ENEMY_PERMANENT: "enemyPermanent" });

const withSteps = (policy) => ({ ...policy, steps: policy.selections > 0 ? Array.from({ length: policy.selections }, () => ({ scope: policy.scope, role: policy.role || "effect" })) : [] });
const withoutSelfDestruction = (text) => text
  .replace(/\bdestrua\s+(?:este|esta|esse|essa)\s+(?:artefato|encanto|carta|constante|permanente)\b[^.]*\.?/g, " ")
  .replace(/\bdestrua-se\b[^.]*\.?/g, " ");

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
  const targetingText = withoutSelfDestruction(text);
  const creatureMention = /\bcriaturas?\b/.test(targetingText);
  const permanentMention = /\b(constantes?|permanentes?)\b/.test(targetingText);
  const amount = number(targetingText.match(/(?:a|em)\s+(\d+|uma?|duas?|dois|tres)\s+(?:criaturas?|constantes?|permanentes?)/)?.[1], 1);
  const enemy = /(?:criaturas?|constantes?|permanentes?)\s+(?:do\s+)?(?:campo\s+)?(?:inimig|adversari)|(?:criaturas?|constantes?|permanentes?)\s+do\s+oponente/.test(targetingText);
  const ally = /(?:criaturas?|constantes?|permanentes?)\s+(?:do\s+)?(?:seu\s+campo|aliad)|sua\s+(?:criatura|constante|permanente)/.test(targetingText);
  if (creatureMention) return withSteps({ scope: enemy ? TargetScope.ENEMY_CREATURE : ally ? TargetScope.ALLY_CREATURE : TargetScope.ANY_CREATURE, selections: amount });
  if (permanentMention) return withSteps({ scope: enemy ? TargetScope.ENEMY_PERMANENT : ally ? TargetScope.ALLY_PERMANENT : TargetScope.ANY_PERMANENT, selections: amount });
  if (/\b(cause|causar|cure|restaure|recupere|aumente|alvo)\b/.test(targetingText)) return withSteps({ scope: TargetScope.ANY_CHARACTER, selections: amount });
  if (/\b(destrua|elimine|derrote|bana|banir|sufoc|congel|atordoad|imobiliz|retorne|devolva)\b/.test(targetingText)) return withSteps({ scope: TargetScope.ANY_PERMANENT, selections: amount });
  return { scope: TargetScope.NONE, selections: 0, steps: [] };
}

const effectScope = (target) => ({
  anyCharacter: TargetScope.ANY_CHARACTER,
  anyCreature: TargetScope.ANY_CREATURE,
  allyCreature: TargetScope.ALLY_CREATURE,
  enemyCreature: TargetScope.ENEMY_CREATURE,
  anyPermanent: TargetScope.ANY_PERMANENT,
  allyPermanent: TargetScope.ALLY_PERMANENT,
  enemyPermanent: TargetScope.ENEMY_PERMANENT,
  otherAllyCreature: TargetScope.ALLY_CREATURE,
  creature: TargetScope.ANY_CREATURE,
}[target] || TargetScope.NONE);

/** Targeting for migrated cards comes from executable ability data, never from
 * incidental words in reminder/passive text. This prevents cards such as
 * Saideira dos Recrutas from requesting a target merely because they mention
 * "Primeiro Ato" and "criaturas". */
export function cardPlayTargetPolicy(card) {
  if (card?.diagnostics?.source !== "explicit") return targetPolicy(card);
  if (card.type === "Artefato") return withSteps({ scope: TargetScope.ALLY_CREATURE, selections: 1, attachment: true, role: "attachment" });
  const trigger = card.type === "Criatura" ? "onEnter" : "onPlay";
  const abilities = (card.abilities || []).filter((ability) => ability.trigger === trigger);
  const sacrificeSteps = abilities.flatMap((ability) => (ability.costs || []).flatMap((cost) => cost.type === "sacrifice"
    ? Array.from({ length: Number(cost.amount) || 1 }, () => ({ scope: TargetScope.ALLY_CREATURE, role: "sacrifice" }))
    : []));
  const effectSteps = abilities.flatMap((ability) => (ability.effects || []).flatMap((effect) => {
    const scope = effectScope(effect.target);
    if (scope === TargetScope.NONE || effect.global) return [];
    const selections = Number(effect.selections) || 1;
    const minimum = effect.minimumSelections == null ? selections : Number(effect.minimumSelections);
    return Array.from({ length: selections }, (_, index) => ({
      scope,
      role: "effect",
      optional: index >= minimum,
      requireExhausted: !!effect.requireExhausted,
      requiredSubtype: effect.requiredSubtype,
      requiresDamagedOwnerThisTurn: effect.type === "destroyIfDamagedControllerThisTurn" || !!effect.requiresDamagedOwnerThisTurn,
      requiresEffectAppliedThisTurn: !!effect.requiresEffectAppliedThisTurn,
      requiresMarker: !!effect.requiresMarker,
      allowedIds: effect.allowedIds,
    }));
  }));
  const steps = [...sacrificeSteps, ...effectSteps];
  return {
    scope: steps[0]?.scope || TargetScope.NONE,
    selections: steps.length,
    minimumSelections: steps.filter((step) => !step.optional).length,
    sacrifice: sacrificeSteps.length > 0,
    sacrificeCount: sacrificeSteps.length,
    steps,
  };
}

export function isValidTarget(policy, owner, targetOwner, targetKind = "creature") {
  if (policy.scope === TargetScope.NONE) return false;
  if (policy.scope === TargetScope.ANY_CHARACTER) return targetKind === "creature" || targetKind === "hero";
  const creature = targetKind === "creature";
  const permanent = creature || targetKind === "permanent";
  if ([TargetScope.ANY_CREATURE, TargetScope.ALLY_CREATURE, TargetScope.ENEMY_CREATURE].includes(policy.scope) && !creature) return false;
  if ([TargetScope.ANY_PERMANENT, TargetScope.ALLY_PERMANENT, TargetScope.ENEMY_PERMANENT].includes(policy.scope) && !permanent) return false;
  if ([TargetScope.ANY_CREATURE, TargetScope.ANY_PERMANENT].includes(policy.scope)) return true;
  if ([TargetScope.ALLY_CREATURE, TargetScope.ALLY_PERMANENT].includes(policy.scope)) return owner === targetOwner;
  return owner !== targetOwner;
}
