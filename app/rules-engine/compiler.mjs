import { abilitiesForLevel, getExplicitCardRule } from "./card-rules.mjs";
import { withDerivedSubtypes } from "./subtypes.mjs";
import { targetPolicy } from "./targeting.mjs";

const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
const folded = (value = "") => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const canonicalKeywords = Object.freeze({ "voar":"Voar", "barreira magica":"Barreira Mágica", "atropelar":"Atropelar", "investida":"Investida", "indomavel":"Indomável", "furtivo":"Furtivo", "veloz":"Veloz", "robusto":"Robusto", "roubo de vida":"Roubo de Vida", "toque da morte":"Toque da Morte", "acelerado":"Acelerado", "congelado":"Congelado", "atordoado":"Atordoado", "sufocado":"Sufocado", "imobilizado":"Imobilizado", "indestrutivel":"Indestrutível", "alerta":"Alerta" });
const keywordMatches = (text = "") => [...new Set(Object.entries(canonicalKeywords).filter(([key]) => new RegExp(`\\b${key.replace(/ /g,"\\s+")}\\b`,"i").test(folded(text))).map(([,value]) => value))];

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
  let cursor = 0;
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const markerStart = current.index ?? 0;
    if (markerStart > cursor) {
      const independent = clean(source.slice(cursor, markerStart));
      if (independent) sections.push({ label: "", text: independent });
    }
    const bodyStart = markerStart + current[0].length;
    const nextMarker = matches[index + 1]?.index ?? source.length;
    let bodyEnd = nextMarker;
    if (folded(current[1]) === "fura-fila") {
      const period = source.indexOf(".", bodyStart);
      if (period >= 0 && period < bodyEnd) bodyEnd = period + 1;
    }
    const body = clean(source.slice(bodyStart, bodyEnd));
    if (body) sections.push({ label: folded(current[1]), text: body });
    cursor = bodyEnd;
  }
  if (cursor < source.length) {
    const independent = clean(source.slice(cursor));
    // A sentence such as "X é o número de cartas..." defines the dynamic
    // value used by the preceding Fura-Fila clause; it is metadata, not a
    // standalone ability. Treating it as another section creates an
    // unsupported phantom ability and makes an otherwise valid card fail
    // canExecuteCard().
    if (independent && !/^x\s+(?:é|e)\b/i.test(independent)) sections.push({ label: "", text: independent });
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
  const supportClauseRaw = raw.match(/suporte\s*:\s*([^.]+)/i)?.[1] || "";
  const nonSupportRaw = clean(raw.replace(/suporte\s*:\s*[^.]+/ig, ""));
  const buff = nonSupportRaw.match(/([+-]?\d+)\s*\/\s*([+-]?\d+)/);
  const offense = nonSupportRaw.match(/(?:recebe|ganha|concede|d[êe])\s*\+?(\d+)\s+(?:de\s+)?ofensividade/i);
  const vitality = nonSupportRaw.match(/(?:recebe|ganha|concede|d[êe])\s*\+?(\d+)\s+(?:de\s+)?vitalidade/i);
  const turnLimited = /(?:durante\s+(?:este|o)\s+turno|neste\s+turno|por\s+(?:1|um)\s+turno|at[eé]\s+o\s+(?:fim|final)\s+(?:deste|do)\s+turno)/i.test(raw);
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
  if (/\b(?:procure|procurar|busque|buscar|busca)\b/.test(value)) { const amount=numberFrom(value.match(/(?:procure|procurar|busque|buscar|busca)(?:\s+por)?\s+(\d+|um|uma|dois|duas|tres)/)?.[1],1); const types=["Criatura","Feitiço","Artefato","Encanto","Terreno"].filter(type=>new RegExp(type.toLowerCase()).test(value)); add("search", { zone:"deck", destination: /campo/.test(value) ? "field" : "hand", amount, types, subtype: value.match(/(?:tipo|classe|subtipo)\s+([a-záàâãéêíóôõúç]+)/i)?.[1], nameIncludes: value.match(/(?:com|por)\s+[“\"]([^”\"]+)[”\"]\s+no nome/i)?.[1], maxCost:Number(value.match(/custo (?:maximo|máximo|menor ou igual a)\s+(\d+)/)?.[1]||0)||undefined, shuffle:true }); }
  if (/invoque|coloque.+campo|ressuscite/.test(value)) add("summon", { source: /cemiterio/.test(value) ? "grave" : /imagem/.test(value) ? "extra" : "generated" });
  if (/\bdesvire/.test(value)) add("ready", { target: "selected" });
  if (/\bvire\b/.test(value) && !parseCosts(raw).some((cost) => cost.type === "tap")) add("tap", { target: "selected" });
  if (marker) add("addMarker", { amount: numberFrom(marker[1], 1), marker: /\+1\/+1/.test(value) ? "+1/+1" : "action" });
  if (buff) add("modifyStats", { attack: Number(buff[1]), health: Number(buff[2]), duration: turnLimited ? "turn" : "permanent" });
  if (!buff && (offense || vitality)) { const policy = targetPolicy(raw); add("modifyStats", { attack: Number(offense?.[1] || 0), health: Number(vitality?.[1] || 0), target: policy.scope === "none" ? "self" : policy.scope, selections: policy.selections, duration: /turno/.test(value) ? "turn" : "permanent" }); }
  if (energy) add("gainEnergy", { amount: Number(energy[1]), destination: /reserva/.test(value) ? "reserve" : "main" });
  if (/custa?\s+\d+\s+a menos|reduz\w*.+custo/.test(value)) add("modifyCost", { amount: -numberFrom(value), duration: /proxim/.test(value) ? "next" : "continuous" });
  const supportText = folded(supportClauseRaw);
  const supportStats = supportClauseRaw.match(/([+-]?\d+)\s*\/\s*([+-]?\d+)/);
  if (supportStats) add("supportAura", { attack: Number(supportStats[1]), health: Number(supportStats[2]) });
  if (supportText) for (const keyword of keywordMatches(supportText)) add("supportAura", { keyword });
  const defender = value.match(/defensor\s+(\d+)/); if (defender) add("keyword", { keyword: `Defensor ${defender[1]}` });
  if (/recebe\s+(?:voar|robusto|furtivo|investida|indestrutivel|barreira magica|roubo de vida|toque da morte|atropelar|alerta)/.test(value)) for(const keyword of keywordMatches(raw)) add("grantKeyword", { keyword, duration: turnLimited ? "turn" : "permanent" });
  for (const keyword of keywordMatches(nonSupportRaw)) { if (effects.some((effect) => effect.type === "grantKeyword" && effect.keyword === keyword)) continue; add("keyword", { keyword, duration: turnLimited ? "turn" : "permanent" }); }
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
    const otherSubtype = section.text.match(/se\s+voc[eê]\s+controlar\s+outra\s+criatura\s+da\s+classe\s+([A-Za-zÀ-ÿ]+)/i)?.[1];
    const condition = section.label === "fura-fila"
      ? { cardsPlayedBeforeThisAtLeast: 1 }
      : otherSubtype
        ? { controllerControlsOtherSubtype: otherSubtype }
        : null;
    const usageLimit = /(?:uma|1)\s+vez\s+por\s+turno/i.test(section.text)
      ? { count: 1, period: "turn" }
      : undefined;
    const conditionalPassive = /\b(quando|sempre que|toda vez que|se )\b/i.test(section.text)
      && ![Trigger.PLAY, Trigger.ENTER, Trigger.DESTROYED, Trigger.ACTIVATED].includes(trigger);
    return {
      id: `ability-${index + 1}`,
      trigger,
      condition,
      costs,
      effects,
      sourceText: section.text,
      usageLimit,
      furaFila: section.label === "fura-fila"
        ? { requiresCardsPlayedBefore: 1, clause: section.text }
        : undefined,
      triggerMeta: {
        kind: section.label === "fura-fila"
          ? "conditional-combo"
          : conditionalPassive
            ? "conditional-passive"
            : "direct",
        scenario: section.text,
      },
    };
  });
  return { abilities, unsupported: abilities.flatMap((ability) => ability.effects.filter((effect) => effect.type === "unsupported")) };
}

export function compileCard(card) {
  if ([12, 13, 14].includes(Number(card?.page))) card = { ...card, type: "Feitiço" };
  if (card?.page === 252) card = { ...card, type: "Feitiço", tags: [...new Set([...(card.tags || []), "Acelerado"])] };
  /* Liaz only gains Furtivo temporarily when an Artefato is actually revealed by Investigar.
     The generated catalog used to promote the conditional rules-text mention into a printed tag. */
  if (card?.page === 263) card = { ...card, tags: (card.tags || []).filter((tag) => String(tag).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() !== "furtivo") };
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

