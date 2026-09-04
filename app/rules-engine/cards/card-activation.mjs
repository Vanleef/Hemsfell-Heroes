import { compileCard, compileCardText, splitTriggeredSections } from "../compiler.mjs";
import { isLegacyAscensionAbility } from "./ascension.mjs";

const isExplicitBoardCost = (cost) => ["tap", "removeMarkers", "sacrifice"].includes(cost.type);
export const activationInsideTriggeredEffect = (text = "") => splitTriggeredSections(text).some((section) => section.label && /\b(vire|virar|virada|remova|remover|sacrifique|sacrificar)\b/i.test(section.text));
export const activatedAbilities = (cardOrText = "") => {
  const explicit = typeof cardOrText === "object";
  const compiled = explicit ? compileCard(cardOrText) : compileCardText(cardOrText);
  return compiled.abilities.filter((ability) =>
    ability.trigger === "activated"
    && !isLegacyAscensionAbility(compiled, ability)
    && (explicit || ability.uiActivation || ability.costs.some(isExplicitBoardCost))
  );
};
export const hasActivatableEffectText = (text = "") => activatedAbilities(text).length > 0;
export const hasActivatableEffect = (card) => activatedAbilities(card).length > 0;
export const activationEnergyCost = (text = "") => activatedAbilities(text).flatMap((ability) => ability.costs).filter((cost) => cost.type === "energy").reduce((highest, cost) => Math.max(highest, Number(cost.amount) || 0), 0);

export function canActivateCard(card, context) {
  /* Virada is a global activation lock for battlefield permanents: an activated
     effect cannot be used again until its source is desvirada, regardless of
     whether that particular printed ability has Vire as an explicit cost. */
  if (card?.activatedThisTurn || card?.suffocated || card?.activationLockedOnEntry || card?.exhausted) return false;
  const ability = activatedAbilities(card)[0]; if (!ability) return false;
  if (card?.summoning) return false;
  if (ability.availability?.reserveBelow != null && (context.reserve || 0) >= ability.availability.reserveBelow) return false;
  if (ability.availability?.topGraveHasTrigger) { const top = context.topGrave; if (!top || top.type !== "Criatura" || !compileCard(top).abilities.some((candidate) => candidate.trigger === ability.availability.topGraveHasTrigger)) return false; }
  return ability.costs.every((cost) => {
    if (cost.type === "tap") return !card.exhausted && !card.summoning;
    if (cost.type === "removeMarkers") { const markers = typeof card.markers === "number" ? card.markers : Object.values(card.markers || {}).reduce((sum, value) => sum + Number(value), 0); return cost.amount === "X" ? markers >= (cost.minimum || 1) : markers >= cost.amount; }
    if (cost.type === "removeMarkersFromConstants") return (context.constantMarkers || 0) >= cost.amount;
    if (cost.type === "sacrifice") return context.hasSacrificeTarget;
    if (cost.type === "energy") return (context.energy || 0) + (context.reserve || 0) >= cost.amount;
    if (cost.type === "life") { const minimumLife = context.heroId === "saymon" && (context.heroLevel || 1) >= 3 ? 1 : 0; return (context.life ?? 30) - cost.amount >= minimumLife; }
    return true;
  });
}
