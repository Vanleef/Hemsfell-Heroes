import { readFile, writeFile } from "node:fs/promises";

const path = "app/rules-engine/compiler.mjs";
let source = (await readFile(path, "utf8")).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

// ---------------------------------------------------------------------------
// Fura-Fila splitter
// Rebuild this function structurally every time. This makes the migration
// idempotent and also repairs partially-applied working trees.
// ---------------------------------------------------------------------------
{
  const splitStart = source.indexOf('export function splitTriggeredSections(text = "") {');
  const costsStart = source.indexOf('export function parseCosts', splitStart);
  if (splitStart < 0 || costsStart < 0) throw new Error("Could not locate compiler section boundaries.");
  const split = `export function splitTriggeredSections(text = "") {
  const source = clean(text);
  const marker = /(primeiro ato|[uú]ltimo suspiro|fura-fila)\\s*:/gi;
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
    if (independent) sections.push({ label: "", text: independent });
  }
  return sections.filter((section) => section.text);
}

`;
  source = source.slice(0, splitStart) + split + source.slice(costsStart);
}

// ---------------------------------------------------------------------------
// Text semantics upgrades. Each insertion is guarded independently so a
// partially migrated compiler can be repaired safely.
// ---------------------------------------------------------------------------
if (!source.includes('const offense = raw.match(')) {
  source = source.replace(
    '  const buff = raw.match(/([+-]?\\d+)\\s*\\/\\s*([+-]?\\d+)/);',
    '  const buff = raw.match(/([+-]?\\d+)\\s*\\/\\s*([+-]?\\d+)/);\n  const offense = raw.match(/(?:recebe|ganha|concede|d[êe])\\s*\\+?(\\d+)\\s+(?:de\\s+)?ofensividade/i);\n  const vitality = raw.match(/(?:recebe|ganha|concede|d[êe])\\s*\\+?(\\d+)\\s+(?:de\\s+)?vitalidade/i);'
  );
}

if (!source.includes('const turnLimited =')) {
  const vitalityLine = '  const vitality = raw.match(/(?:recebe|ganha|concede|d[êe])\\s*\\+?(\\d+)\\s+(?:de\\s+)?vitalidade/i);';
  if (!source.includes(vitalityLine)) throw new Error("Could not locate vitality parser insertion point.");
  source = source.replace(
    vitalityLine,
    `${vitalityLine}\n  const turnLimited = /(?:durante\\s+(?:este|o)\\s+turno|neste\\s+turno|por\\s+(?:1|um)\\s+turno|at[eé]\\s+o\\s+(?:fim|final)\\s+(?:deste|do)\\s+turno)/i.test(raw);`
  );
}

source = source.replace(
  '  if (buff) add("modifyStats", { attack: Number(buff[1]), health: Number(buff[2]), duration: /turno/.test(value) ? "turn" : "permanent" });',
  '  if (buff) add("modifyStats", { attack: Number(buff[1]), health: Number(buff[2]), duration: turnLimited ? "turn" : "permanent" });'
);

if (!source.includes('if (!buff && (offense || vitality))')) {
  const buffLine = '  if (buff) add("modifyStats", { attack: Number(buff[1]), health: Number(buff[2]), duration: turnLimited ? "turn" : "permanent" });';
  if (!source.includes(buffLine)) throw new Error("Could not locate stat modifier insertion point.");
  source = source.replace(
    buffLine,
    `${buffLine}\n  if (!buff && (offense || vitality)) { const policy = targetPolicy(raw); add("modifyStats", { attack: Number(offense?.[1] || 0), health: Number(vitality?.[1] || 0), target: policy.scope === "none" ? "self" : policy.scope, selections: policy.selections, duration: turnLimited ? "turn" : "permanent" }); }`
  );
}

source = source.replace(
  '  if (/recebe\\s+(?:voar|robusto|furtivo|investida|indestrutivel|barreira magica|roubo de vida|toque da morte|atropelar|alerta)/.test(value)) for(const keyword of keywordMatches(raw)) add("grantKeyword", { keyword });',
  '  if (/recebe\\s+(?:voar|robusto|furtivo|investida|indestrutivel|barreira magica|roubo de vida|toque da morte|atropelar|alerta)/.test(value)) for(const keyword of keywordMatches(raw)) add("grantKeyword", { keyword, duration: turnLimited ? "turn" : "permanent" });'
);

source = source.replace(
  '  for(const keyword of keywordMatches(raw)){if(supportText&&folded(supportText).includes(folded(keyword)))continue;add("keyword", { keyword });}',
  '  for(const keyword of keywordMatches(raw)){if(supportText&&folded(supportText).includes(folded(keyword)))continue;if(effects.some((effect)=>effect.type==="grantKeyword"&&effect.keyword===keyword))continue;add("keyword", { keyword, duration: turnLimited ? "turn" : "permanent" });}'
);

// ---------------------------------------------------------------------------
// compileCardText — canonical rebuild
// This is deliberately rebuilt wholesale instead of patched line-by-line.
// Previous migrations could leave duplicate `usageLimit` and
// `conditionalPassive` declarations in the same callback. Rebuilding the
// function guarantees exactly one declaration of each and repairs those
// working trees automatically on the next `npm run rules:migrate`.
// ---------------------------------------------------------------------------
{
  const compileStart = source.indexOf('export function compileCardText(text = "") {');
  const cardStart = source.indexOf('export function compileCard(card) {', compileStart);
  if (compileStart < 0 || cardStart < 0) throw new Error("Could not locate compileCardText boundaries.");

  const compileCardText = `export function compileCardText(text = "") {
  const sections = splitTriggeredSections(text);
  const abilities = sections.map((section, index) => {
    const trigger = inferTrigger(section, text);
    const costs = trigger === Trigger.ACTIVATED ? parseCosts(section.text) : [];
    const effects = parseEffects(section.text).filter((effect) => !(trigger === Trigger.ACTIVATED && effect.type === "sacrifice"));
    const otherSubtype = section.text.match(/se\\s+voc[eê]\\s+controlar\\s+outra\\s+criatura\\s+da\\s+classe\\s+([A-Za-zÀ-ÿ]+)/i)?.[1];
    const condition = section.label === "fura-fila"
      ? { cardsPlayedBeforeThisAtLeast: 1 }
      : otherSubtype
        ? { controllerControlsOtherSubtype: otherSubtype }
        : null;
    const usageLimit = /(?:uma|1)\\s+vez\\s+por\\s+turno/i.test(section.text)
      ? { count: 1, period: "turn" }
      : undefined;
    const conditionalPassive = /\\b(quando|sempre que|toda vez que|se )\\b/i.test(section.text)
      && ![Trigger.PLAY, Trigger.ENTER, Trigger.DESTROYED, Trigger.ACTIVATED].includes(trigger);
    return {
      id: ` + "`ability-${index + 1}`" + `,
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

`;

  source = source.slice(0, compileStart) + compileCardText + source.slice(cardStart);
}

await writeFile(path, source);
console.log("Card semantics compiler prepared and repaired.");
