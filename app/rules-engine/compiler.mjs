import { abilitiesForLevel, getExplicitCardRule } from "./card-rules.mjs";
import { withDerivedSubtypes } from "./subtypes.mjs";
import { targetPolicy } from "./targeting.mjs";

const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
const folded = (value = "") => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const Trigger = Object.freeze({
  PLAY: "onPlay",
  ENTER: "onEnter",
  DESTROYED: "onDestroyed",
  SPELL_CAST: "onSpellCast",
  CREATURE_ENTER: "onCreatureEnter",
  DAMAGE: "onDamage",
  LIFE_LOST: "onLifeLost",
  MAINTENANCE: "onMaintenance",
  COMBAT_START: "onCombatStart",
  TURN_END: "onTurnEnd",
  ACTIVATED: "activated",
  STATIC: "static",
});

const numberFrom = (value, fallback = 1) => {
  const word = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, três: 3, quatro: 4, cinco: 5 };
  const token = folded(value).match(/\b(\d+|um|uma|dois|duas|tres|quatro|cinco)\b/)?.[1];
  return token == null ? fallback : Number.isFinite(Number(token)) ? Number(token) : word[token] ?? fallback;
};

export function splitTriggeredSections(text = "") {
  const source = clean(text);
  const marker = /(primeiro ato|[uú]ltimo suspiro|fura-fila)\s*:/gi;
  const matches = [...source.matchAll(marker)];
  if (!matches.length) return [{ label: "", text: source }];
  const sections = [];
  if (matches[0].index > 0) sections.push({ label: "", text: clean(source.slice(0, matches[0].index)) });
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const end = matches[index + 1]?.index ?? source.length;
    sections.push({ label: folded(current[1]), text: clean(source.slice(current.index + current[0].length, end)) });
  }
  return sections.filter((section) => section.text);
}

export function parseCosts(text = "") {
  const value = folded(text);
  const remove = value.match(/remova\s+(\d+|x|um|uma|dois|duas|tres|quatro|cinco)\s+marcador/);
  const energy = value.match(/(?:pague|gaste)\s+(\d+)\s+(?:de\s+)?energia/);
  const life = value.match(/(?:pague|perca|perda)\s+(\d+)\s+(?:de\s+)?(?:vida|pontos? de vida)/);
  const costs = [];
  if (/^(?:vire|virar)\b|\bvire\s+(?:esta|essa|a)\s+carta\b/.test(value)) costs.push({ type: "tap", amount: 1 });
  if (remove) costs.push({ type: "removeMarkers", amount: remove[1] === "x" ? "X" : numberFrom(remove[1]) });
  if (/\bsacrifique\b/.test(value)) costs.push({ type: "sacrifice", amount: numberFrom(value.match(/sacrifique\s+([^.:;]+)/)?.[1], 1), selector: "ally" });
  if (energy) costs.push({ type: "energy", amount: Number(energy[1]) });
  if (life) costs.push({ type: "life", amount: Number(life[1]) });
  return costs;
}

export function parseEffects(text = "") {
  const raw = clean(text);
  const value = folded(raw);
  const effects = [];
  const add = (type, data = {}) => effects.push({ type, ...data });
  const draw = value.match(/compre\s+(\d+|um|uma|dois|duas|tres)/);
  const damage = value.match(/cause\s+(\d+)\s+(?:de\s+)?dano/);
  const heal = value.match(/(?:cure|restaure|recupere)\s+(\d+)\s+(?:pontos?\s+de\s+)?vida/);
  const mill = value.match(/triture\s+(\d+|um|uma|dois|duas|tres)/);
  const marker = value.match(/(?:coloque|recebe?)\s+(\d+|um|uma|dois|duas|tres)?\s*marcador/);
  const buff = raw.match(/([+-]?\d+)\s*\/\s*([+-]?\d+)/);
  const energy = value.match(/(?:receba|recupere|adicione)\s+(\d+)\s+(?:de\s+)?energia/);
  if (draw) add("draw", { amount: numberFrom(draw[1]) });
  if (/descarte|descarta/.test(value)) add("discard", { amount: numberFrom(value.match(/descart\w*\s+([^.;]+)/)?.[1], 1) });
  if (mill) add("mill", { amount: numberFrom(mill[1]) });
  if (damage) { const policy = targetPolicy(raw); add(policy.global ? "damageAll" : "damage", { amount: Number(damage[1]), target: policy.scope, selections: policy.selections }); }
  if (heal) { const policy = targetPolicy(raw); add("heal", { amount: Number(heal[1]), target: policy.scope, selections: policy.selections }); }
  if (/\bdestrua|\bdestruir/.test(value)) add("destroy", { target: /todas?/.test(value) ? "all" : "selected" });
  if (/\bsacrifique\b/.test(value)) add("sacrifice", { amount: numberFrom(value.match(/sacrifique\s+([^.:;]+)/)?.[1], 1), target: "ally" });
  if (/\bbana|\bbanir|\bbane\b/.test(value)) add("banish", { target: "selected" });
  if (/retorne|devolva/.test(value)) add("returnToHand", { target: "selected" });
  if (/procure|busque/.test(value)) add("search", { destination: /campo/.test(value) ? "field" : "hand" });
  if (/invoque|coloque.+campo|ressuscite/.test(value)) add("summon", { source: /cemiterio/.test(value) ? "grave" : /imagem/.test(value) ? "extra" : "generated" });
  if (/\bdesvire/.test(value)) add("ready", { target: "selected" });
  if (/\bvire\b/.test(value) && !parseCosts(raw).some((cost) => cost.type === "tap")) add("tap", { target: "selected" });
  if (marker) add("addMarker", { amount: numberFrom(marker[1], 1), marker: /\+1\/+1/.test(value) ? "+1/+1" : "action" });
  if (buff) add("modifyStats", { attack: Number(buff[1]), health: Number(buff[2]), duration: /turno/.test(value) ? "turn" : "permanent" });
  if (energy) add("gainEnergy", { amount: Number(energy[1]), destination: /reserva/.test(value) ? "reserve" : "main" });
  if (/custa?\s+\d+\s+a menos|reduz\w*.+custo/.test(value)) add("modifyCost", { amount: -numberFrom(value), duration: /proxim/.test(value) ? "next" : "continuous" });
  if (/recebe\s+(?:voar|robusto|furtivo|investida|indestrutivel|barreira magica|roubo de vida|toque da morte|atropelar)/.test(value)) add("grantKeyword", { raw });
  if (/\b(voar|barreira magica|atropelar|investida|indomavel|furtivo|veloz|robusto|defensor\s*\d+|roubo de vida|toque da morte|acelerado|congelado|atordoado|sufocado|suporte|imobilizado|indestrutivel)\b/.test(value)) add("keyword", { raw });
  if (/\binvestigar\b/.test(value)) add("investigate", { amount: numberFrom(value) });
  if (/\brevel|\barquiv/.test(value)) add("revealOrArchive", { raw });
  if (/\banule|\bcancele/.test(value)) add("counter", { target: "selected" });
  if (/\btransforme|se torna/.test(value)) add("transform", { raw });
  if (/\b(ao inves de|em vez de|seria|nao pode|não pode|previna|permanece com)\b/.test(value)) add("replacement", { raw });
  if (/\bescolha (?:um|uma|ate|até)|\bopcao|\bopção/.test(value)) add("choice", { raw });
  if (/\bigual (?:a|ao)|equivalente/.test(value)) add("dynamicValue", { raw });
  if (!effects.length && raw) add("unsupported", { raw });
  return effects;
}

function inferTrigger(section, fullText) {
  if (section.label === "primeiro ato") return Trigger.ENTER;
  if (section.label === "ultimo suspiro") return Trigger.DESTROYED;
  if (section.label === "fura-fila") return Trigger.PLAY;
  const value = folded(section.text);
  if (/^(vire|remova|sacrifique|pague|perca|perda)\b/.test(value)) return Trigger.ACTIVATED;
  if (/ao conjurar|sempre que.+feitico|toda vez.+feitico/.test(value)) return Trigger.SPELL_CAST;
  if (/quando.+criatura.+entr|sempre que.+criatura.+entr/.test(value)) return Trigger.CREATURE_ENTER;
  if (/quando.+perd.+vida|sempre que.+perd.+vida/.test(value)) return Trigger.LIFE_LOST;
  if (/quando.+causar dano|sempre que.+causar dano/.test(value)) return Trigger.DAMAGE;
  if (/no inicio.+manutencao|durante.+manutencao/.test(value)) return Trigger.MAINTENANCE;
  if (/inicio.+combate/.test(value)) return Trigger.COMBAT_START;
  if (/no fim.+turno|final.+turno/.test(value)) return Trigger.TURN_END;
  if (/\b(quando|sempre que|toda vez|enquanto|durante)\b/.test(value)) return Trigger.STATIC;
  return folded(fullText).includes("acelerado") ? Trigger.PLAY : Trigger.PLAY;
}

export function compileCardText(text = "") {
  const sections = splitTriggeredSections(text);
  const abilities = sections.map((section, index) => {
    const trigger = inferTrigger(section, text);
    const costs = trigger === Trigger.ACTIVATED ? parseCosts(section.text) : [];
    const effects = parseEffects(section.text).filter((effect) => !(trigger === Trigger.ACTIVATED && effect.type === "sacrifice"));
    return { id: `ability-${index + 1}`, trigger, condition: section.label === "fura-fila" ? { type: "cardsPlayedAtLeast", amount: 1 } : null, costs, effects, sourceText: section.text };
  });
  return { abilities, unsupported: abilities.flatMap((ability) => ability.effects.filter((effect) => effect.type === "unsupported")) };
}

export function compileCard(card) {
  card = withDerivedSubtypes(card);
  const explicit = getExplicitCardRule(card);
  if (explicit) {
    const abilities = abilitiesForLevel(explicit, card?.level || 1).map((ability, index) => ({ id: ability.id || `${card.id}-ability-${index + 1}`, ...ability }));
    return { ...card, abilities, rules: explicit, diagnostics: { unsupported: 0, source: "explicit", ignored: !!explicit.ignored } };
  }
  const compiled = compileCardText(card?.text || "");
  const abilities = compiled.abilities.map((ability) => card?.type === "Feitiço" && ability.trigger === Trigger.ACTIVATED ? { ...ability, trigger: Trigger.PLAY } : ability);
  return { ...card, abilities, diagnostics: { unsupported: compiled.unsupported.length, source: "text" } };
}

export function auditCards(cards = []) {
  const seen = new Set();
  const issues = [];
  let abilities = 0;
  let unsupported = 0;
  for (const card of cards) {
    if (!card?.id || seen.has(card.id)) issues.push({ card: card?.id, severity: "error", code: "duplicate-or-missing-id" });
    seen.add(card?.id);
    if (!Number.isInteger(card?.cost) || card.cost < 0) issues.push({ card: card?.id, severity: "error", code: "invalid-cost" });
    if (card?.type === "Criatura" && (!Number.isFinite(card.atk) || !Number.isFinite(card.hp))) issues.push({ card: card?.id, severity: "error", code: "missing-creature-stats" });
    const result = compileCard(card);
    abilities += result.abilities.length;
    unsupported += result.diagnostics.unsupported;
    if (/her[oó]i alvo/i.test(card?.text || "")) issues.push({ card: card.id, severity: "warning", code: "manual-hero-target-conflict" });
    const manualSections = splitTriggeredSections(card?.text || "").filter((section) => !section.label);
    if (!result.rules?.ignored && manualSections.some((section) => /sacrifique/i.test(section.text)) && !result.abilities.some((ability) => [Trigger.ACTIVATED, Trigger.PLAY].includes(ability.trigger) && ability.costs.some((cost) => cost.type === "sacrifice"))) issues.push({ card: card.id, severity: "error", code: "unparsed-sacrifice-cost" });
  }
  return { cards: cards.length, abilities, unsupported, coverage: abilities ? (abilities - unsupported) / abilities : 1, issues };
}
