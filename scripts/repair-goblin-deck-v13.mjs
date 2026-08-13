import { readFile, writeFile } from "node:fs/promises";

const read = async (path) => (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
const write = (path, value) => writeFile(path, value);
const insertBefore = (source, marker, addition, label) => {
  if (source.includes(addition.trim())) return source;
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Patch point not found: ${label}`);
  return source.slice(0, index) + addition + source.slice(index);
};

// Sr. Goblin deck: authoritative card rules that cannot be represented safely
// by the generic printed-text parser.
{
  const path = "app/rules-engine/card-rules.mjs";
  let source = await read(path);

  const rules = [
    ['p29:', '  p29: [ability("onPlay", [effect("keyword", { keyword: "Investida" }), effect("modifyStats", { target: "self", attack: 1, health: 0, duration: "permanent" })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],\n'],
    ['p31:', '  p31: [ability("onPlay", [effect("damage", { amount: 2, target: "anyCharacter", selections: 1 })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],\n'],
    ['p33:', '  p33: [ability("onCardPlayed", [effect("draw", { amount: 1 })], [], { condition: { eventOwnerIsController: true, eventCardKeyword: "Fura-fila" }, triggerMeta: { kind: "conditional-passive", scenario: "Sempre que você jogar uma carta com Fura-fila." } })],\n'],
    ['p34:', '  p34: [ability("onEnter", [effect("damageAndMarkRepeat", { amount: 1, target: "anyCreature", selections: 1 })]), ability("onCreatureDestroyed", [effect("damageAndMarkRepeat", { amount: 1, target: "anyCreature", selections: 1 })], [], { condition: { eventKilledBySource: true }, triggerMeta: { kind: "conditional-passive", scenario: "Se a criatura que recebeu o dano de Bafo de Fumaça morrer, repita o efeito." } })],\n'],
    ['p44:', '  p44: [ability("onPlay", [effect("gainEnergy", { amount: 1, destination: "main" }), effect("disableReserveStorage", { duration: "turn" })])],\n'],
  ];
  for (const [needle, rule] of rules) {
    if (!new RegExp(`\\b${needle.replace(':','')}\\s*:`).test(source)) source = insertBefore(source, '  p37: [ability("activated"', rule, needle);
  }

  source = source.replace(
    'p42: [ability("onPlay", [effect("draw", { amount: 1 }), effect("modifySelfCost", { amount: -1, zone: "hand" })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],',
    'p42: [ability("onPlay", [effect("draw", { amount: 1 })])],'
  );

  await write(path, source);
}

// Reusable primitives for the Goblin deck.
{
  const path = "app/rules-engine/effects.mjs";
  let source = await read(path);
  if (!source.includes('damageAndMarkRepeat(state')) {
    const marker = '  damageFromCardsPlayedThisTurn(state, effect, context) {';
    const index = source.indexOf(marker);
    if (index < 0) throw new Error("Patch point not found: Goblin dynamic damage handlers");
    const handlers = `  damageAndMarkRepeat(state, effect, context) {\n    const target = findUnit(state, context.targetIds?.[0]);\n    if (!target) throw new RulesViolation("target-required");\n    defaultEffectHandlers.damage(state, { ...effect, type: "damage" }, context);\n    const owner = state.players.findIndex((entry) => (entry.board || []).includes(target));\n    const healthBonus = (target.modifiers || []).reduce((sum, item) => sum + (item.health || 0), 0);\n    if (owner >= 0 && (target.damage || 0) >= (target.hp || 1) + healthBonus) target.killedByRepeatSourceId = context.sourceId;\n  },\n  disableReserveStorage(state, effect, context) { player(state, context.owner).noReserveStorageThisTurn = true; },\n`;
    source = source.slice(0, index) + handlers + source.slice(index);
  }
  await write(path, source);
}

// Engine semantics shared by Fura-fila, Fuscão, Bafo and Sr. Goblin.
{
  const path = "app/rules-engine/engine.mjs";
  let source = await read(path);

  source = source.replace(
    'if (condition.eventCardSubtype && !subtype(eventCard || {}, condition.eventCardSubtype)) return false;',
    'if (condition.eventCardSubtype && !subtype(eventCard || {}, condition.eventCardSubtype)) return false;\n  if (condition.eventCardKeyword && !hasKeyword(eventCard || {}, new RegExp(String(condition.eventCardKeyword).replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&"), "i"))) return false;\n  if (condition.eventKilledBySource && event.card?.killedByRepeatSourceId !== (source.uid || source.id)) return false;'
  );

  source = source.replace(
    'if (card.page === 149) return -entry.board.filter((unit) => subtype(unit, "Vampiro")).length;',
    'if (card.page === 42 && (entry.turnCardsPlayed || 0) >= 1) return -1;\n  if (entry.heroId === "goblin" && (entry.level || 1) >= 3 && card.type === "Criatura" && subtype(card, "Goblin") && !(entry.subtypesEnteredThisTurn?.Goblin || 0)) return -(card.cost || 0);\n  if (card.page === 149) return -entry.board.filter((unit) => subtype(unit, "Vampiro")).length;'
  );

  source = source.replace(
    'summoning: card.type === "Artefato" || (card.type === "Criatura" && !(card.tags || []).some((tag) => /investida/i.test(String(tag)))),',
    'summoning: card.type === "Artefato" || (card.type === "Criatura" && !((card.tags || []).some((tag) => /investida/i.test(String(tag))) && !(card.page === 29 && Math.max(0, (entry.turnCardsPlayed || 0) - 1) < 1))),'
  );

  source = source.replace(
    'stack.push({ kind: "event", event: { type: spell ? "onSpellCast" : "onCardPlayed", owner: item.command.owner, cardId: card.id, card } });',
    'stack.push({ kind: "event", event: { type: "onCardPlayed", owner: item.command.owner, cardId: card.id, card } }); if (spell) stack.push({ kind: "event", event: { type: "onSpellCast", owner: item.command.owner, cardId: card.id, card } });'
  );

  const returnMarker = '  return result.sort((a, b) => a.owner - b.owner || (a.source.slot ?? 99) - (b.source.slot ?? 99) || String(a.ability.id).localeCompare(String(b.ability.id)));';
  if (!source.includes('goblin-hero-level-1')) {
    const heroTriggers = `  state.players.forEach((entry, owner) => {\n    if (entry.heroId !== "goblin") return;\n    const heroSource = { uid: \`goblin-hero-\${owner}\`, id: \`goblin-hero-\${owner}\`, name: "Sr. Goblin, o Mercador de Bugigangas", slot: -1 };\n    if ((entry.level || 1) >= 1 && event.type === "onPermanentLeaves" && event.owner === owner && subtype(event.card || {}, "Goblin")) {\n      const ability = { id: "goblin-hero-level-1", trigger: "onPermanentLeaves", effects: [{ type: "draw", amount: 1 }], usageLimit: { count: 1, period: "turn" } };\n      if (usageAvailable(state, heroSource, owner, ability)) result.push({ source: heroSource, owner, ability });\n    }\n    if ((entry.level || 1) >= 2 && event.type === "onMaintenance" && event.owner === owner) {\n      result.push({ source: heroSource, owner, ability: { id: "goblin-hero-level-2", trigger: "onMaintenance", effects: [{ type: "draw", amount: 1 }] } });\n    }\n  });\n`;
    if (!source.includes(returnMarker)) throw new Error("Patch point not found: activeAbilities return");
    source = source.replace(returnMarker, heroTriggers + returnMarker);
  }

  await write(path, source);
}

// The UI must display the same canonical turn counter used by the rules engine,
// and Suborno must prevent banking leftover main energy into reserve.
{
  const path = "app/page.tsx";
  let source = await read(path);
  source = source.replace('if(player.heroId==="goblin")return player.goblinTurnCardsPlayed||0;', 'if(player.heroId==="goblin")return player.turnCardsPlayed||0;');
  source = source.replace('reserve:number;deck:CardDef[];', 'reserve:number;noReserveStorageThisTurn?:boolean;deck:CardDef[];');
  source = source.replace(
    'const bankRemainingEnergy=(p:Player)=>{p.reserve=Math.min(3,p.reserve+p.energy);p.energy=0};',
    'const bankRemainingEnergy=(p:Player)=>{if(!p.noReserveStorageThisTurn)p.reserve=Math.min(3,p.reserve+p.energy);p.energy=0};'
  );
  source = source.replace('p.nextCreaturePaysLife=false;[...p.board', 'p.nextCreaturePaysLife=false;p.noReserveStorageThisTurn=false;[...p.board');
  await write(path, source);
}

console.log("Goblin deck v13 repaired: combo cards, Bafo chain, Fuscao triggers, Fiado cost, Suborno reserve lock, and Sr. Goblin cumulative hero powers.");
