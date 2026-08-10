export class RulesViolation extends Error {
  constructor(code, message = code) { super(message); this.name = "RulesViolation"; this.code = code; }
}

const player = (state, owner) => state.players[owner];
const allUnits = (state) => state.players.flatMap((entry) => [...(entry.board || []), ...(entry.support || []), ...(entry.terrain ? [entry.terrain] : [])]);
const findUnit = (state, id) => allUnits(state).find((unit) => unit.uid === id || unit.id === id);
const removeFromZones = (state, id) => {
  for (const entry of state.players) for (const zone of ["board", "support"]) {
    const index = (entry[zone] || []).findIndex((card) => card.uid === id || card.id === id);
    if (index >= 0) return { card: entry[zone].splice(index, 1)[0], owner: state.players.indexOf(entry), zone };
  }
  return null;
};

export const defaultEffectHandlers = Object.freeze({
  draw(state, effect, context) {
    const entry = player(state, context.owner); let amount = effect.amount ?? 1;
    while (amount-- > 0) { const card = entry.deck.shift(); if (!card) { entry.deckOut = true; break; } entry.hand.push(card); }
  },
  discard(state, effect, context) {
    const entry = player(state, context.owner); const amount = Math.min(effect.amount ?? 1, entry.hand.length);
    entry.grave.push(...entry.hand.splice(Math.max(0, entry.hand.length - amount), amount));
  },
  mill(state, effect, context) {
    const entry = player(state, effect.target === "enemy" ? 1 - context.owner : context.owner);
    entry.grave.push(...entry.deck.splice(0, effect.amount ?? 1));
  },
  damage(state, effect, context) {
    const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required");
    const robust = (target.tags || []).some((tag) => /robusto/i.test(tag)) ? 1 : 0;
    target.damage = (target.damage || 0) + Math.max(0, (effect.amount ?? 0) - robust);
  },
  damageAll(state, effect) { for (const target of allUnits(state)) defaultEffectHandlers.damage(state, { ...effect, type: "damage" }, { targetIds: [target.uid || target.id] }); },
  heal(state, effect, context) {
    if (effect.target === "controller") { const entry = player(state, context.owner); entry.life = Math.min(entry.maxLife ?? 30, entry.life + (effect.amount ?? 0)); return; }
    const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); target.damage = Math.max(0, (target.damage || 0) - (effect.amount ?? 0));
  },
  destroy(state, effect, context) {
    for (const id of effect.target === "all" ? allUnits(state).map((unit) => unit.uid || unit.id) : context.targetIds || []) {
      const removed = removeFromZones(state, id); if (removed) player(state, removed.owner).grave.push({ ...removed.card, lastZone: removed.zone, deathCause: "destroy" });
    }
  },
  sacrifice(state, effect, context) {
    for (const id of context.sacrificeIds || []) { const removed = removeFromZones(state, id); if (removed) player(state, removed.owner).grave.push({ ...removed.card, lastZone: removed.zone, deathCause: "sacrifice", suppressDeathTrigger: true }); }
  },
  banish(state, effect, context) {
    for (const id of context.targetIds || []) { const removed = removeFromZones(state, id); if (removed) player(state, removed.owner).obscuro.push(removed.card); }
  },
  returnToHand(state, effect, context) {
    for (const id of context.targetIds || []) { const removed = removeFromZones(state, id); if (removed) player(state, removed.owner).hand.push(removed.card); }
  },
  tap(state, effect, context) { const target = findUnit(state, context.targetIds?.[0] || context.sourceId); if (!target) throw new RulesViolation("target-required"); target.exhausted = true; },
  ready(state, effect, context) { const target = findUnit(state, context.targetIds?.[0] || context.sourceId); if (!target) throw new RulesViolation("target-required"); target.exhausted = false; },
  addMarker(state, effect, context) { const target = findUnit(state, context.targetIds?.[0] || context.sourceId); if (!target) throw new RulesViolation("target-required"); target.markers = { ...(target.markers || {}), [effect.marker || "action"]: ((target.markers || {})[effect.marker || "action"] || 0) + (effect.amount ?? 1) }; },
  modifyStats(state, effect, context) { const target = findUnit(state, context.targetIds?.[0] || context.sourceId); if (!target) throw new RulesViolation("target-required"); target.modifiers ||= []; target.modifiers.push({ attack: effect.attack || 0, health: effect.health || 0, duration: effect.duration || "permanent" }); },
  gainEnergy(state, effect, context) { const entry = player(state, context.owner); const key = effect.destination === "reserve" ? "reserve" : "energy"; const cap = key === "reserve" ? 3 : entry.maxEnergy; entry[key] = Math.min(cap, entry[key] + (effect.amount ?? 0)); },
  grantKeyword(state, effect, context) { const target = findUnit(state, context.targetIds?.[0] || context.sourceId); if (!target) throw new RulesViolation("target-required"); target.grantedKeywords ||= []; target.grantedKeywords.push(effect.raw); },
  unsupported() { throw new RulesViolation("unsupported-effect", "Card effect has not been migrated to a primitive"); },
});

export function applyEffect(state, effect, context, handlers = defaultEffectHandlers) {
  const handler = handlers[effect.type]; if (!handler) throw new RulesViolation("unknown-effect", `Unknown effect: ${effect.type}`);
  handler(state, effect, context); return state;
}
