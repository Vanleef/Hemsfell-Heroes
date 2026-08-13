import { readFile, writeFile } from "node:fs/promises";

const read = async (path) => (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
const write = (path, value) => writeFile(path, value);

// ---------------------------------------------------------------------------
// Engine: `effect.subtype` may describe a value being granted (Dança Macabra),
// not a restriction on the selected target. Only requiredSubtype constrains a
// target. Generated Images disappear without Last Breath/onDestroyed.
// ---------------------------------------------------------------------------
{
  const path = "app/rules-engine/engine.mjs";
  let source = await read(path);
  source = source.replace(
    'requiredSubtype: effect.requiredSubtype || effect.subtype, requiredName:',
    'requiredSubtype: effect.requiredSubtype, requiredName:',
  );
  source = source.replace(
    'if (!unit.suppressDeathTrigger) stack.push({ kind: "event", event: { type: "onDestroyed", owner, sourceId: unit.uid, cardId: unit.uid, card: unit, deathCause: "effect" } });',
    'if (!unit.suppressDeathTrigger && !unit.generatedImage && !unit.imageCard) stack.push({ kind: "event", event: { type: "onDestroyed", owner, sourceId: unit.uid, cardId: unit.uid, card: unit, deathCause: "effect" } });',
  );
  await write(path, source);
}

// ---------------------------------------------------------------------------
// Effects: direct destroy must follow the same Image death rule. Add the
// authoritative dynamic destroy used by ZOIUDO: the maximum target cost is the
// controller's cards-played counter when the Fura-Fila resolves.
// ---------------------------------------------------------------------------
{
  const path = "app/rules-engine/effects.mjs";
  let source = await read(path);
  source = source.replace(
    'if (!removed.card.suppressDeathTrigger) queueEvent(state, { type: "onDestroyed", owner: removed.owner, card: removed.card, cardId: removed.card.uid || removed.card.id, sourceId: removed.card.uid || removed.card.id, deathCause: "destroy" });',
    'if (!removed.card.suppressDeathTrigger && !removed.card.generatedImage && !removed.card.imageCard) queueEvent(state, { type: "onDestroyed", owner: removed.owner, card: removed.card, cardId: removed.card.uid || removed.card.id, sourceId: removed.card.uid || removed.card.id, deathCause: "destroy" });',
  );
  if (!source.includes('destroyByCardsPlayedThisTurn(state')) {
    const marker = '  damageFromCardsPlayedThisTurn(state, effect, context) {';
    const index = source.indexOf(marker);
    if (index < 0) throw new Error("Could not locate dynamic turn effect handlers.");
    const handler = `  destroyByCardsPlayedThisTurn(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); const limit = Math.max(0, player(state, context.owner).turnCardsPlayed || 0); if ((target.cost || 0) > limit) throw new RulesViolation("target-cost-too-high"); defaultEffectHandlers.destroy(state, { type: "destroy", target: "selected" }, context); },\n`;
    source = source.slice(0, index) + handler + source.slice(index);
  }
  await write(path, source);
}

// ---------------------------------------------------------------------------
// Explicit card data: subtype restrictions are named requiredSubtype. ZOIUDO
// is explicit so the explanatory X sentence can never become a phantom ability.
// ---------------------------------------------------------------------------
{
  const path = "app/rules-engine/card-rules.mjs";
  let source = await read(path);
  source = source.replace(
    'effect("modifyStats", { target: "anyCreature", subtype: "Dragão", attack: 0, health: 2, duration: "turn" })',
    'effect("modifyStats", { target: "anyCreature", requiredSubtype: "Dragão", attack: 0, health: 2, duration: "turn" })',
  );
  source = source.replace(
    'effect("grantKeyword", { target: "anyCreature", subtype: "Malorga", keyword: "Toque da Morte", duration: "turn" })',
    'effect("grantKeyword", { target: "anyCreature", requiredSubtype: "Malorga", keyword: "Toque da Morte", duration: "turn" })',
  );
  if (!/\bp32:\s*\[/.test(source)) {
    const marker = '  p37: [ability("activated"';
    const index = source.indexOf(marker);
    if (index < 0) throw new Error("Could not locate Goblin explicit-rule insertion point.");
    const rule = '  p32: [ability("static", [effect("keyword", { keyword: "Veloz" })]), ability("onPlay", [effect("destroyByCardsPlayedThisTurn", { target: "anyCreature", selections: 1 })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],\n';
    source = source.slice(0, index) + rule + source.slice(index);
  }
  await write(path, source);
}

console.log("Authoritative rules v6 repaired: Images, subtype targeting, and ZOIUDO.");
