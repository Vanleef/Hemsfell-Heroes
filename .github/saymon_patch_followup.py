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
new = '  const command = { type: "activate", owner, sourceId: cardId(source), abilityId: ability.id };\n  const xCost = (ability.costs || []).find((cost) => cost.type === "removeMarkers" && String(cost.amount || "").toUpperCase() === "X");'
ai = must_replace(ai, old, new, 'variable marker cost normalization')
old = '    for (const source of permanentUnits(entry)) for (const ability of source.abilities || []) if (ability.trigger === "activated") { const command = completeAIActivationCommand(state, owner, source, ability, difficulty); if (command) candidates.push(command); }'
new = '''    for (const source of permanentUnits(entry)) {
      const abilities = (source.abilities || []).filter((ability) => ability.trigger === "activated");
      if (Number(source.page) === 134 || normalized(source.name) === "cobra dor") {
        const ability = abilities[0];
        const available = markerTotal(source), missingLife = Math.max(0, Number(entry.maxLife ?? 30) - Number(entry.life || 0));
        if (ability && !source.summoning && available > 0 && missingLife > 0) candidates.push({ type: "activate", owner, sourceId: cardId(source), abilityId: ability.id, markerAmount: Math.min(available, missingLife) });
        continue;
      }
      for (const ability of abilities) { const command = completeAIActivationCommand(state, owner, source, ability, difficulty); if (command) candidates.push(command); }
    }'''
ai = must_replace(ai, old, new, 'Cobra direct activation candidate')
ai_path.write_text(ai)

test_path = Path('tests/saymon-authoritative-regressions.test.mjs')
test_text = test_path.read_text()
test_text = must_replace(test_text,
'const byName = (name) => compileCard(cards.find((card) => card.name === name));',
'const normalize = (value = "") => String(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();\nconst byName = (name) => compileCard(cards.find((card) => normalize(card.name) === normalize(name)));',
'normalized test card lookup')
test_text = test_text.replace('const cobra = field(byName("Cobra Dor"), "cobra");', 'const cobra = field(compileCard(cards.find((card) => Number(card.page) === 134)), "cobra");')
test_text = test_text.replace('assert.equal(cobraCommand?.markerAmount, 3, JSON.stringify({page:cobra.page,name:cobra.name,abilities:cobra.abilities,commands}));', 'assert.equal(cobraCommand?.markerAmount, 3);')
test_path.write_text(test_text)
