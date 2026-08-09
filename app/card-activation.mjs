export const activationInsideTriggeredEffect = (text = "") =>
  /(?:primeiro ato|último suspiro|ultimo suspiro)\s*:\s*[^.]*\b(vire|virar|virada|remova|remover|sacrifique|sacrificar)\b/i.test(text);

export const hasActivatableEffectText = (text = "") =>
  !activationInsideTriggeredEffect(text) &&
  /\b(vire|virar|virada|remova|remover|sacrifique|sacrificar)\b/i.test(text);

export const activationEnergyCost = (text = "") =>
  Number(text.match(/pague\s+(\d+)\s+de energia/i)?.[1] || 0);

export function canActivateCard(card, context) {
  const text = card?.text || "";
  if (!hasActivatableEffectText(text) || card?.activatedThisTurn || card?.suffocated) return false;

  const requiresTap = /\b(vire|virar|virada)\b/i.test(text);
  const markersToRemove = Number(text.match(/remova\s+(\d+)\s+marcador/i)?.[1] || 0);
  const requiresSacrifice = /\bsacrifique\b/i.test(text);
  const energy = activationEnergyCost(text);

  return (
    (!requiresTap || (!card.exhausted && !card.summoning)) &&
    (!markersToRemove || (card.markers || 0) >= markersToRemove) &&
    (!requiresSacrifice || context.hasSacrificeTarget) &&
    (context.energy || 0) + (context.reserve || 0) >= energy
  );
}
