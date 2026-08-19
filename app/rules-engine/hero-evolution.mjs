import { hasSubtype } from "./subtypes.mjs";

const EVOLUTION_THRESHOLDS = Object.freeze({
  gimble: [2, 4],
  goblin: [3, 5],
  uruk: [4, 8],
  tifon: [3, 7],
  saymon: [3, 5],
  tessalia: [3, 6],
  quarion: [2, 4],
  rasmus: [5, 7],
  ngoro: [5, 10],
  zayan: [3, 4],
  natureza: [10, 20],
});

const permanents = (entry) => [...(entry?.board || []), ...(entry?.support || []), ...(entry?.terrain ? [entry.terrain] : [])];
const fold = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase();
const markerTotal = (card) => typeof card?.markers === "number" ? Number(card.markers || 0) : Object.values(card?.markers || {}).reduce((sum, value) => sum + Number(value || 0), 0);

function effectiveCreatureName(entry, unit) {
  let name = unit?.name || "";
  for (const attachment of (entry?.support || []).filter((card) => card.attachedTo === unit?.uid && !card.suffocated)) {
    const rename = String(attachment.text || "").match(/se equipad[ao][^“\"]*[“\"]([^”\"]+)[”\"][\s\S]*?(?:agora\s+se\s+chama|passa\s+a\s+se\s+chamar)[^“\"]*[“\"]([^”\"]+)[”\"]/i);
    if (rename && fold(name) === fold(rename[1])) name = rename[2];
  }
  return name;
}

export function heroEvolutionThresholds(player) {
  return EVOLUTION_THRESHOLDS[player?.heroId] || [3, 6];
}

export function heroEvolutionCost(player) {
  return (player?.level || 1) === 1 ? 2 : 3;
}

export function heroEvolutionProgress(state, owner) {
  const entry = state?.players?.[owner];
  if (!entry) return 0;
  if (entry.heroId === "uruk") return Number(entry.spellsPlayed || 0);
  if (entry.heroId === "gimble") return (entry.board || []).filter((card) => hasSubtype(card, "Dragão")).length;
  if (entry.heroId === "goblin") return Number(entry.turnCardsPlayed || 0);
  if (entry.heroId === "quarion") return new Set((entry.board || []).map((unit) => fold(effectiveCreatureName(entry, unit))).filter(Boolean)).size;
  if (entry.heroId === "rasmus") return (state.players || []).flatMap((candidate) => candidate.board || []).filter((card) => hasSubtype(card, "Gato")).length;
  if (entry.heroId === "zayan") return permanents(entry).filter((card) => !String(card.text || "").trim()).length;
  if (entry.heroId === "natureza") return permanents(entry).reduce((sum, card) => sum + markerTotal(card), 0);
  return Number(entry.heroXP || 0);
}

export function canEvolveHero(state, owner) {
  const entry = state?.players?.[owner];
  if (!entry || state.active !== owner || state.phase !== "principal" || (entry.level || 1) >= 3 || Number(entry.levelUpsThisTurn || 0) > 0) return false;
  const thresholds = heroEvolutionThresholds(entry);
  const need = Number(thresholds[(entry.level || 1) - 1] ?? Number.POSITIVE_INFINITY);
  return heroEvolutionProgress(state, owner) >= need && Number(entry.energy || 0) + Number(entry.reserve || 0) >= heroEvolutionCost(entry);
}

export function evolveHero(state, owner) {
  if (!canEvolveHero(state, owner)) return false;
  const entry = state.players[owner];
  const cost = heroEvolutionCost(entry);
  const fromEnergy = Math.min(Number(entry.energy || 0), cost);
  entry.energy = Number(entry.energy || 0) - fromEnergy;
  entry.reserve = Math.max(0, Number(entry.reserve || 0) - (cost - fromEnergy));
  entry.level = Math.min(3, Number(entry.level || 1) + 1);
  entry.levelUpsThisTurn = Number(entry.levelUpsThisTurn || 0) + 1;
  return true;
}

export { EVOLUTION_THRESHOLDS };
