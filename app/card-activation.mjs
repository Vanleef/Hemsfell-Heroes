import { compileCardText, splitTriggeredSections } from "./rules-engine/compiler.mjs";

const isExplicitBoardCost = (cost) => ["tap", "removeMarkers", "sacrifice"].includes(cost.type);

export const activationInsideTriggeredEffect = (text = "") =>
  splitTriggeredSections(text).some((section) =>
    section.label && /\b(vire|virar|virada|remova|remover|sacrifique|sacrificar)\b/i.test(section.text),
  );

export const activatedAbilities = (text = "") =>
  compileCardText(text).abilities.filter((ability) =>
    ability.trigger === "activated" && ability.costs.some(isExplicitBoardCost),
  );

export const hasActivatableEffectText = (text = "") => activatedAbilities(text).length > 0;

export const activationEnergyCost = (text = "") =>
  activatedAbilities(text).flatMap((ability) => ability.costs)
    .filter((cost) => cost.type === "energy")
    .reduce((highest, cost) => Math.max(highest, Number(cost.amount) || 0), 0);

export function canActivateCard(card, context) {
  if (card?.activatedThisTurn || card?.suffocated) return false;
  const ability = activatedAbilities(card?.text || "")[0];
  if (!ability) return false;
  return ability.costs.every((cost) => {
    if (cost.type === "tap") return !card.exhausted && !card.summoning;
    if (cost.type === "removeMarkers") return cost.amount === "X" ? (card.markers || 0) > 0 : (card.markers || 0) >= cost.amount;
    if (cost.type === "sacrifice") return context.hasSacrificeTarget;
    if (cost.type === "energy") return (context.energy || 0) + (context.reserve || 0) >= cost.amount;
    if (cost.type === "life") return (context.life || 30) > cost.amount;
    return true;
  });
}
