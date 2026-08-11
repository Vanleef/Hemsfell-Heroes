const DIFFICULTY = Object.freeze({
  "Fácil": { cardBudget: 1, responseBias: 0.25, attackBias: 0.68 },
  Normal: { cardBudget: 2, responseBias: 0.55, attackBias: 0.9 },
  "Difícil": { cardBudget: 3, responseBias: 0.9, attackBias: 1 },
});

export const aiDifficultyProfile = (difficulty = "Normal") => DIFFICULTY[difficulty] || DIFFICULTY.Normal;

export function isReadyAttacker(unit) {
  const used = unit?.attacksThisTurn ?? (unit?.attackedThisTurn ? 1 : 0);
  return !!unit && !unit.cannotAttack && !unit.exhausted && !unit.summoning && !unit.stunned && !unit.immobilized && used < (unit.attackLimit || 1);
}

export function hasTessaliaCommander(player) {
  return player?.heroId !== "tessalia" || (player.board || []).some((unit) => unit.slot === 2 && !unit.suffocated);
}

export function legalAIAttackers(player) {
  if (!player) return [];
  const commanderPresent = hasTessaliaCommander(player);
  return (player.board || []).filter((unit) => isReadyAttacker(unit) && (player.heroId !== "tessalia" || unit.slot === 2 || commanderPresent));
}

export function orderAIAttackers(player, difficulty = "Normal") {
  return legalAIAttackers(player).toSorted((a, b) => {
    if (player.heroId === "tessalia" && (a.slot === 2) !== (b.slot === 2)) return a.slot === 2 ? -1 : 1;
    if (difficulty === "Difícil") return ((b.atk || 0) + (b.bonusAtk || 0)) - ((a.atk || 0) + (a.bonusAtk || 0));
    return (a.slot || 0) - (b.slot || 0);
  });
}

export function preferredAISlot(player) {
  const occupied = new Set((player?.board || []).map((unit) => unit.slot));
  if (player?.heroId === "tessalia" && !occupied.has(2)) return 2;
  return [0, 1, 2, 3, 4].find((slot) => !occupied.has(slot));
}

export function canAIPlayLifeCost(card, player) {
  const printedLoss = Number(String(card?.text || "").match(/\bperca\s+(\d+)\s+(?:de\s+)?vida/i)?.[1] || 0);
  const minimum = player?.heroId === "saymon" && (player.level || 1) >= 3 ? 1 : 0;
  return !printedLoss || (player?.life || 0) - printedLoss >= minimum;
}

export function chooseAIPlayable(playable, player, opponent, difficulty = "Normal", random = Math.random) {
  if (!playable.length) return undefined;
  if (difficulty === "Fácil") return playable[Math.floor(random() * playable.length)] || playable[0];
  const score = ({ c }) => {
    let value = (c.cost || 0) * (difficulty === "Difícil" ? 2 : 1);
    if (c.type === "Criatura") value += 2 + (c.atk || 0) + (c.hp || 0) * 0.45;
    if (/primeiro ato|compre|destrua|cause\s+\d+\s+de dano/i.test(c.text || "")) value += 3;
    if (player?.heroId === "tessalia" && c.type === "Criatura" && !(player.board || []).some((unit) => unit.slot === 2)) value += 12;
    if (player?.heroId === "goblin" && /fura-fila|goblin/i.test(`${c.text} ${(c.subtypes || []).join(" ")}`)) value += 3;
    if (player?.heroId === "uruk" && c.type === "Feitiço") value += 3;
    if (player?.heroId === "saymon" && /roubo de vida|cure/i.test(c.text || "") && (player.life || 0) < 15) value += 4;
    if ((opponent?.board || []).length && /dano|destrua|sufocad|congelad|atordoad/i.test(c.text || "")) value += 2;
    return value + random() * 0.01;
  };
  return playable.toSorted((a, b) => score(b) - score(a))[0];
}
