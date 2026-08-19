from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# 1) Legacy match compatibility: the modern rules engine already models p10,
# but the still-mounted large match page has a legacy death callback. Make that
# compatibility path resolve the printed acid burst instead of a manual no-op.
replace_once(
    "app/page.tsx",
    '    if(c.page===116){p.reserve=Math.min(3,p.reserve+1);log(g,"Conjurador concedeu 1 de energia à Reserva por Último Suspiro.","energy");resolved=true}',
    '    if(c.page===10){const targets=g.players.flatMap(entry=>entry.board);targets.forEach(unit=>{unit.damage=(unit.damage||0)+2});log(g,`Dragão de Limo explodiu em ácido e causou 2 de dano a ${targets.length} criatura(s) em campo.`,"damage");resolved=true}\n'
    '    if(c.page===116){p.reserve=Math.min(3,p.reserve+1);log(g,"Conjurador concedeu 1 de energia à Reserva por Último Suspiro.","energy");resolved=true}',
)

# 2) The p46 end trigger belongs only to the controller's current turn. This is
# also important now that Online Finalization has an explicit response window.
replace_once(
    "app/rules-engine/card-rules.mjs",
    'effect("moveSelf", { destination: "grave" })])],\n  p47:',
    'effect("moveSelf", { destination: "grave" })], [], { condition: { eventOwnerIsController: true } })],\n  p47:',
)

# 3) A persisted temporary-field marker must never leak into a hidden zone.
replace_once(
    "app/rules-engine/effects.mjs",
    '    "effectAppliedRound", "effectAppliedSourceId", "staysExhaustedUntilSpellEffect", "skipNextUntap"\n',
    '    "effectAppliedRound", "effectAppliedSourceId", "staysExhaustedUntilSpellEffect", "skipNextUntap", "remainUntilTurnEnd"\n',
)

# 4) Add a semantic safety-net at the boundary that actually leaves Finalization.
# p46/p47 normally remove themselves through onTurnEnd while entering Finalization;
# this cleanup guarantees a remainUntilTurnEnd spell can never survive into the
# next player's Maintenance even if an interrupted/legacy snapshot skipped that
# self-move trigger.
engine = Path("app/rules-engine/engine-base.mjs")
text = engine.read_text(encoding="utf-8")
helper_anchor = '\nfunction resetCardForZone(state, card) {\n'
helper = '''\nfunction expireTurnEndSupport(state, stack) {\n  state.players.forEach((entry, owner) => {\n    const expired = (entry.support || []).filter((card) => card.remainUntilTurnEnd);\n    if (!expired.length) return;\n    entry.support = (entry.support || []).filter((card) => !card.remainUntilTurnEnd);\n    for (const card of expired) {\n      if (!card.generatedImage && !card.imageCard) entry.grave.push(resetCardForZone(state, card));\n      stack.push({ kind: "event", event: { type: "onPermanentLeaves", owner, sourceId: card.uid || card.id, card, zone: "support", destination: "grave", expiredAtTurnEnd: true } });\n    }\n  });\n}\n'''
if text.count(helper_anchor) != 1:
    raise SystemExit("engine-base.mjs: resetCardForZone anchor mismatch")
text = text.replace(helper_anchor, helper + helper_anchor, 1)
advance_anchor = '      else if (item.command.type === "advancePhase") {\n'
if text.count(advance_anchor) != 1:
    raise SystemExit("engine-base.mjs: advancePhase anchor mismatch")
text = text.replace(
    advance_anchor,
    advance_anchor + '        if (state.phase === "fim") expireTurnEndSupport(state, stack);\n',
    1,
)
engine.write_text(text, encoding="utf-8")

# Document the compatibility guarantee next to the Online migration status.
doc = Path("docs/online-priority-implementation.md")
doc_text = doc.read_text(encoding="utf-8")
needle = '- Finalization exposes an explicit response checkpoint before cleanup and turn handoff.\n'
addition = needle + '- `remainUntilTurnEnd` support spells are defensively expired when Finalization is left, so interrupted/legacy snapshots cannot carry Tranqueira-Mática or similar temporary spell-permanents into the next turn.\n'
if doc_text.count(needle) != 1:
    raise SystemExit("docs/online-priority-implementation.md: Finalization anchor mismatch")
doc.write_text(doc_text.replace(needle, addition, 1), encoding="utf-8")
