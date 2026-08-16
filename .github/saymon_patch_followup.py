from pathlib import Path


def must_replace(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing follow-up pattern: {label}')
    return text.replace(old, new, 1)

engine_path = Path('app/rules-engine/engine-base.mjs')
engine = engine_path.read_text()
old = 'if (targetOwner < 0 || (!hero && !target) || !isValidTarget(step, owner, targetOwner, targetKind) || (!hero && !targetMatchesStep(state, target, id, step)) || (step.requireExhausted && (!target || !target.exhausted))) throw new RulesViolation("invalid-target");'
new = 'if ((step.excludeIds || []).includes(id) || targetOwner < 0 || (!hero && !target) || !isValidTarget(step, owner, targetOwner, targetKind) || (!hero && !targetMatchesStep(state, target, id, step)) || (step.requireExhausted && (!target || !target.exhausted))) throw new RulesViolation("invalid-target");'
engine = must_replace(engine, old, new, 'exclude hero targets during direct validation')
engine_path.write_text(engine)

ai_path = Path('app/rules-engine/ai.mjs')
ai = ai_path.read_text()
old = 'const xCost = (ability.costs || []).find((cost) => cost.type === "removeMarkers" && cost.amount === "X");'
new = 'const xCost = (ability.costs || []).find((cost) => cost.type === "removeMarkers" && (String(cost.amount || "").toUpperCase() === "X" || Number(source.page) === 134));'
ai = must_replace(ai, old, new, 'variable marker cost detection')
ai_path.write_text(ai)
