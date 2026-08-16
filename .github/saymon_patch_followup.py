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

legacy_path = Path('tests/rules-engine.test.mjs')
legacy = legacy_path.read_text()
old = '''test("Condutor de Rasnóvia replaces its First Act with a bounded Vampiro search", () => {
  const game = state(); game.players[0].life = 20; game.players[0].deck.push({ id: "drawn" }, { id: "cheap", type: "Criatura", cost: 3, subtypes: ["Vampiro"] }, { id: "valid", type: "Criatura", cost: 4, subtypes: ["Vampiro"] });
  game.players[0].hand.push(compileCard({ id: "p135", page: 135, name: "Condutor de Rasnóvia", type: "Criatura", cost: 0, atk: 3, hp: 3, text: "", tags: [] }));
  const entered = executeCommand(game, { type: "playCard", owner: 0, cardId: "p135", slot: 0, skipPriority: true }).state;
  const source = entered.players[0].board[0]; assert.equal(entered.players[0].life, 16); assert.equal(entered.players[0].hand[0].id, "drawn"); assert.equal(source.firstActReplaced, true);
  defaultEffectHandlers.search(entered, source.abilities[0].effects[0], { owner: 0, sourceId: source.uid });
  assert.equal(entered.pendingDecision.effect.minCost, 4); assert.equal(entered.pendingDecision.effect.subtype, "Vampiro"); assert.equal(entered.pendingDecision.effect.amount, 1);
});'''
new = '''test("Condutor de Rasnóvia offers draw or a four-life Vampiro search", () => {
  const game = state(); game.players[0].heroId = "saymon"; game.players[0].level = 3; game.players[0].life = 20; game.players[0].deck.push({ id: "drawn" }, { id: "cheap", type: "Criatura", cost: 3, subtypes: ["Vampiro"] }, { id: "valid", type: "Criatura", cost: 4, subtypes: ["Vampiro"] });
  game.players[0].hand.push(compileCard({ id: "p135", page: 135, name: "Condutor de Rasnóvia", type: "Criatura", cost: 0, atk: 3, hp: 3, text: "", tags: [] }));
  let entered = executeCommand(game, { type: "playCard", owner: 0, cardId: "p135", slot: 0, skipPriority: true }).state;
  assert.equal(entered.players[0].life, 20); assert.equal(entered.pendingDecision?.kind, "choice");
  entered = executeCommand(entered, { type: "resolveDecision", owner: 0, choiceIndex: 1 }).state;
  assert.equal(entered.players[0].life, 16); assert.equal(entered.pendingDecision?.kind, "search");
  assert.equal(entered.pendingDecision.effect.minCost, 4); assert.equal(entered.pendingDecision.effect.subtype, "Vampiro"); assert.equal(entered.pendingDecision.effect.amount, 1);
});'''
legacy = must_replace(legacy, old, new, 'legacy Condutor test')
legacy_path.write_text(legacy)
