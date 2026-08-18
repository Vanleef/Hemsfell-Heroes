from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one anchor, found {count}")
    p.write_text(text.replace(old, new, 1))

rules = Path('tests/rules-engine.test.mjs')
text = rules.read_text()

old_saideira = '''test("Saideira passively replays a Recruit First Act on every leave-field event", () => {
  for (const eventType of ["onDestroyed", "onPermanentLeaves"]) {
    const game = state();
    game.players[0].life = 20;
    game.players[0].terrain = { uid: "saideira", type: "Terreno", staticModifiers: [{ type: "recruitFirstActOnLeave" }], abilities: [] };
    const recruit = compileCard({ id: "p189", page: 189, name: "Recruta Pinguço", type: "Criatura", text: "", tags: ["Primeiro Ato"], subtypes: ["Recruta"] });
    const result = executeCommand(game, { type: "emit", event: { type: eventType, owner: 0, sourceId: "recruit", card: { ...recruit, uid: "recruit" } } }).state;
    assert.equal(result.players[0].life, 22, eventType);
    assert.equal(result.pendingDecision, undefined);
  }
});'''
new_saideira = '''test("Saideira replays a Recruit First Act exactly once from the canonical leave-field event", () => {
  const recruit = compileCard({ id: "p189", page: 189, name: "Recruta Pinguço", type: "Criatura", text: "", tags: ["Primeiro Ato"], subtypes: ["Recruta"] });
  const leaving = state();
  leaving.players[0].life = 20;
  leaving.players[0].terrain = { uid: "saideira", type: "Terreno", staticModifiers: [{ type: "recruitFirstActOnLeave" }], abilities: [] };
  const replayed = executeCommand(leaving, { type: "emit", event: { type: "onPermanentLeaves", owner: 0, sourceId: "recruit", card: { ...recruit, uid: "recruit" } } }).state;
  assert.equal(replayed.players[0].life, 22);
  assert.equal(replayed.pendingDecision, undefined);

  const destroyedOnly = state();
  destroyedOnly.players[0].life = 20;
  destroyedOnly.players[0].terrain = { uid: "saideira", type: "Terreno", staticModifiers: [{ type: "recruitFirstActOnLeave" }], abilities: [] };
  const ignoredDuplicate = executeCommand(destroyedOnly, { type: "emit", event: { type: "onDestroyed", owner: 0, sourceId: "recruit", card: { ...recruit, uid: "recruit" } } }).state;
  assert.equal(ignoredDuplicate.players[0].life, 20, "onDestroyed must not duplicate the same leave-field replay");
});'''
if old_saideira not in text:
    raise SystemExit('Saideira legacy regression anchor not found')
text = text.replace(old_saideira, new_saideira, 1)

old_nada = '''test("Nada se cria selects a creature and replays its First Act through authoritative decisions", () => {
  const game = state();
  const source = compileCard({ id: "p183", page: 183, name: "Recruta Apaixonado", type: "Criatura", text: "", tags: ["Primeiro Ato"], subtypes: ["Recruta"] });
  game.players[0].board.push({ uid: "invalid-source", name: "Sem alvo inimigo", type: "Criatura", slot: 2, abilities: [{ id: "enemy-only", trigger: "onEnter", effects: [{ type: "damage", amount: 1, target: "enemyCreature" }] }] }, { ...source, uid: "source", slot: 0, modifiers: [] }, { uid: "target", name: "Alvo", type: "Criatura", slot: 1, hp: 2, tags: [], modifiers: [], abilities: [] });
  game.players[0].hand.push(compileCard({ id: "p151", page: 151, name: "Nada se cria, tudo se copia", type: "Feitiço", cost: 0, text: "", tags: [] }));
  const chooseSource = executeCommand(game, { type: "playCard", owner: 0, cardId: "p151" }).state;
  assert.equal(chooseSource.pendingDecision.kind, "replay-ability");
  assert.equal(chooseSource.pendingDecision.effect.choices.length, 1);
  assert.match(chooseSource.pendingDecision.effect.choices[0][0].name, /Recruta Apaixonado/);
  const chooseTarget = executeCommand(chooseSource, { type: "resolveDecision", owner: 0, selectedCardId: "source" }).state;
  assert.equal(chooseTarget.pendingDecision.kind, "targets");
  const resolved = executeCommand(chooseTarget, { type: "resolveDecision", owner: 0, targetIds: ["target"] }).state;
  assert.equal(resolved.players[0].board.find((unit) => unit.uid === "target").modifiers[0].health, 2);
});'''
new_nada = '''test("Nada se cria selects the First Act creature on the battlefield and then uses normal target selection", () => {
  const game = state();
  const source = compileCard({ id: "p183", page: 183, name: "Recruta Apaixonado", type: "Criatura", text: "", tags: ["Primeiro Ato"], subtypes: ["Recruta"] });
  game.players[0].board.push({ uid: "invalid-source", name: "Sem alvo inimigo", type: "Criatura", slot: 2, abilities: [{ id: "enemy-only", trigger: "onEnter", effects: [{ type: "damage", amount: 1, target: "enemyCreature" }] }] }, { ...source, uid: "source", slot: 0, modifiers: [] }, { uid: "target", name: "Alvo", type: "Criatura", slot: 1, hp: 2, tags: [], modifiers: [], abilities: [] });
  game.players[0].hand.push(compileCard({ id: "p151", page: 151, name: "Nada se cria, tudo se copia", type: "Feitiço", cost: 0, text: "", tags: [] }));
  const chooseTarget = executeCommand(game, { type: "playCard", owner: 0, cardId: "p151", targetIds: ["source"] }).state;
  assert.equal(chooseTarget.pendingDecision.kind, "targets");
  assert.notEqual(chooseTarget.pendingDecision.kind, "replay-ability");
  const resolved = executeCommand(chooseTarget, { type: "resolveDecision", owner: 0, targetIds: ["target"] }).state;
  assert.equal(resolved.players[0].board.find((unit) => unit.uid === "target").modifiers[0].health, 2);
});'''
if old_nada not in text:
    raise SystemExit('Nada legacy regression anchor not found')
text = text.replace(old_nada, new_nada, 1)
rules.write_text(text)

quarion = Path('tests/quarion-authoritative.test.mjs')
qtext = quarion.read_text()
qtext = qtext.replace('assert.equal(game.pendingDecision,null);assert.equal(game.players[0].hand.length,1)', 'assert.ok(!game.pendingDecision);assert.equal(game.players[0].hand.length,1)', 1)
quarion.write_text(qtext)
