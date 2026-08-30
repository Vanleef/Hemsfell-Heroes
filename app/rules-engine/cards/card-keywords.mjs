const normalize = (value = "") => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, " ")
  .trim()
  .toLowerCase();

const stripGrantedPrefix = (value) => String(value ?? "").replace(/^(?:attachment|support|duelist|hero):[^:]+:/, "");

const collectStaticKeywords = (effects = [], target = new Set()) => {
  for (const effect of effects || []) {
    if ((effect?.type === "keyword" || effect?.type === "grantKeyword") && effect.keyword) target.add(String(effect.keyword));
    collectStaticKeywords(effect?.effects || [], target);
    for (const branch of effect?.branches || []) collectStaticKeywords(branch?.effects || [], target);
    for (const choice of effect?.choices || []) collectStaticKeywords(choice || [], target);
  }
  return target;
};

/**
 * Keywords that are actually active on a battlefield card.
 *
 * Do not infer active keywords from arbitrary rules text: cards such as Liaz
 * mention Furtivo and Barreira Mágica only as conditional investigation rewards.
 * Trigger labels (Primeiro Ato / Último Suspiro) are semantic UI markers, so
 * they are derived from both their printed label and the matching authoritative
 * trigger when the generated catalog omitted the visual tag.
 */
export function intrinsicKeywordNames(card) {
  if (!card || card.suffocated) return [];

  const names = new Set([
    ...(card.tags || []).map(String),
    ...(card.temporaryTags || []).map(String),
    ...(card.grantedKeywords || []).map(stripGrantedPrefix),
  ]);

  const abilities = card.abilities || [];
  for (const ability of abilities) {
    if (ability?.trigger === "static") collectStaticKeywords(ability.effects || [], names);
  }

  const text = String(card.text || "");
  const normalizedText = normalize(text);
  if (/\bultimo suspiro\b/.test(normalizedText) && abilities.some((ability) => ability?.trigger === "onDestroyed")) names.add("Último Suspiro");
  if (/\bprimeiro ato\b/.test(normalizedText) && abilities.some((ability) => ability?.trigger === "onEnter")) names.add("Primeiro Ato");

  return [...names].filter(Boolean);
}

export function hasIntrinsicKeyword(card, keyword) {
  const wanted = normalize(keyword);
  return !!wanted && intrinsicKeywordNames(card).some((value) => normalize(value).includes(wanted));
}
