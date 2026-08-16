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
old = '  const command = { type: "activate", owner, sourceId: cardId(source), abilityId: ability.id };\n  const xCost = (ability.costs || []).find((cost) => cost.type === "removeMarkers" && cost.amount === "X");'
new = '''  const command = { type: "activate", owner, sourceId: cardId(source), abilityId: ability.id };
  if (Number(source.page) === 134) {
    const available = markerTotal(source), missingLife = Math.max(0, Number(entry.maxLife ?? 30) - Number(entry.life || 0));
    if (available < 1 || missingLife < 1) return null;
    command.markerAmount = Math.min(available, missingLife);
  }
  const xCost = (ability.costs || []).find((cost) => cost.type === "removeMarkers" && String(cost.amount || "").toUpperCase() === "X");'''
ai = must_replace(ai, old, new, 'Cobra marker amount and variable marker cost')
ai_path.write_text(ai)
