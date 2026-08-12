import { readFile, writeFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const write = (path, value) => writeFile(path, value);
const replaceRequired = (source, before, after, label) => {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Patch point not found: ${label}`);
  return source.replace(before, after);
};

// Keep the target-decision stylesheet last among the imported CSS layers.
{
  const path = "app/lab.css";
  let source = await read(path);
  source = source.replaceAll('@import "./rules-interaction-v2.css";\n', "");
  source = replaceRequired(
    source,
    '@import "./lab-interaction-responsive.css";\n',
    '@import "./lab-interaction-responsive.css";\n@import "./rules-interaction-v2.css";\n',
    "responsive rule UI import order",
  );
  await write(path, source);
}

// Image Creatures inherit creature sickness for activated effects too; ordinary
// printed creature abilities keep their existing rules unless their cost taps.
{
  const path = "app/rules-engine/engine.mjs";
  let source = await read(path);
  source = replaceRequired(
    source,
    'if (!ability) throw new RulesViolation("ability-not-found"); if (source.type === "Artefato" && (source.summoning || source.enteredRound === state.round)) throw new RulesViolation("summoning-sickness");',
    'if (!ability) throw new RulesViolation("ability-not-found"); if ((source.type === "Artefato" || ((source.generatedImage || source.imageCard) && source.type === "Criatura")) && (source.summoning || source.enteredRound === state.round)) throw new RulesViolation("summoning-sickness");',
    "Image Creature activation sickness",
  );

  // cleanupLethal has its own attachment removal path, so preserve artifacts
  // whose rules explicitly react to the equipped host being destroyed.
  const oldCleanup = 'for (const attachment of attachments) { if (attachment.generatedImage || attachment.imageCard) continue; if (attachment.page === 154) entry.obscuro.push(resetCardForZone(state, attachment)); else entry.grave.push(resetCardForZone(state, attachment)); }';
  const newCleanup = 'for (const attachment of attachments) { const survivesHost = (attachment.abilities || []).some((ability) => ability.trigger === "onAttachedHostDestroyed"); if (survivesHost) { attachment.attachedTo = undefined; attachment.slot = unit.slot; entry.support.push(attachment); stack.push({ kind: "event", event: { type: "onAttachedHostDestroyed", owner, sourceId: attachment.uid || attachment.id, card: attachment, host: unit } }); continue; } if (attachment.generatedImage || attachment.imageCard) continue; if (attachment.page === 154) entry.obscuro.push(resetCardForZone(state, attachment)); else entry.grave.push(resetCardForZone(state, attachment)); }';
  source = replaceRequired(source, oldCleanup, newCleanup, "lethal attachment passive preservation");
  await write(path, source);
}

console.log("Card semantics v2 follow-up applied successfully.");
