from pathlib import Path

# Restore the explicit extra First Act instance for an entering Recruit under Chefe da Guarda.
path = Path('app/rules-engine/engine-base.mjs')
text = path.read_text()
anchor = '''  if ((event.type === "onDestroyed" || event.type === "onPermanentLeaves") && event.card && subtype(event.card, "Recruta")) state.players.forEach((entry, owner) => {'''
assert anchor in text
enter_block = '''  if (event.type === "onCreatureEnter" && event.card && subtype(event.card, "Recruta")) state.players.forEach((entry, owner) => {
    if (event.owner !== owner) return;
    const chief = permanentUnits(entry).find((source) => source.page === 182 && !source.suffocated && (source.staticModifiers || []).some((modifier) => modifier.type === "doubleRecruitEffects"));
    if (!chief || event.sourceId === chief.uid) return;
    const effects = (event.card.abilities || []).filter((ability) => ability.trigger === "onEnter").flatMap((ability) => ability.effects || []);
    if (effects.length) result.push({ source: chief, owner, ability: { id: `${chief.uid}-recruit-enter-copy`, effects, replaySourceId: event.card.uid || event.card.id } });
  });
'''
if 'recruit-enter-copy' not in text:
    text = text.replace(anchor, enter_block + anchor)
path.write_text(text)

# Update legacy assertions to the newly approved Quarion rules.
path = Path('tests/rules-engine.test.mjs')
text = path.read_text()
text = text.replace('assert.equal(explicitRuleIds.length, 254);', 'assert.equal(explicitRuleIds.length, 255);')
text = text.replace('[id === "p181" ? "recruitFirstActOnLeave" : "doubleRecruitFirstAct"]', '[id === "p181" ? "recruitFirstActOnLeave" : "doubleRecruitEffects"]')
text = text.replace('staticModifiers: [{ type: "doubleRecruitFirstAct" }]', 'staticModifiers: [{ type: "doubleRecruitEffects" }]')
text = text.replace('assert.equal(migrated.length, 306); assert.equal(pending.length, 0);', 'assert.equal(migrated.length, 298); assert.equal(pending.length, 0);')
text = text.replace('assert.equal(report.cards, 306);', 'assert.equal(report.cards, 298);')
old_caneca = '''test("Caneca da Sorte grants one modifier and Magic Barrier to Recruta Pinguço", () => {
  const game=state(); game.players[0].board.push({uid:"pinguco",id:"p189",page:189,name:"Recruta Pinguço",type:"Criatura",slot:0,atk:2,hp:2,tags:[],modifiers:[],abilities:[]}); game.players[0].hand.push(compileCard({id:"p192",page:192,name:"Caneca da Sorte",type:"Artefato",cost:0,text:"",tags:[]}));
  const result=executeCommand(game,{type:"playCard",owner:0,cardId:"p192",instanceId:"mug",slot:0,attachedTo:"pinguco"}).state; const host=result.players[0].board[0]; assert.equal(host.modifiers.length,1); assert.deepEqual([host.modifiers[0].attack,host.modifiers[0].health],[2,-1]); assert.ok(host.grantedKeywords.some(value=>/barreira mágica/i.test(value)));
});'''
new_caneca = '''test("Caneca da Sorte grants its modifier and spell-damage immunity without Magic Barrier", () => {
  const game=state(); game.players[0].board.push({uid:"pinguco",id:"p189",page:189,name:"Recruta Pinguço",type:"Criatura",slot:0,atk:2,hp:2,tags:[],modifiers:[],abilities:[]}); game.players[0].hand.push(compileCard({id:"p192",page:192,name:"Caneca da Sorte",type:"Artefato",cost:0,text:"",tags:[]}));
  const result=executeCommand(game,{type:"playCard",owner:0,cardId:"p192",instanceId:"mug",slot:0,attachedTo:"pinguco"}).state; const host=result.players[0].board[0], mug=result.players[0].support.find(card=>card.uid==="mug"); assert.equal(host.modifiers.length,1); assert.deepEqual([host.modifiers[0].attack,host.modifiers[0].health],[2,-1]); assert.equal((host.grantedKeywords||[]).some(value=>/barreira mágica/i.test(value)),false); assert.ok(mug.staticModifiers.some(value=>value.type==="attachedSpellDamageImmunity"));
});'''
assert old_caneca in text
text = text.replace(old_caneca, new_caneca)
path.write_text(text)

# Keep the non-spell damage regression non-lethal so the target remains inspectable.
path = Path('tests/quarion-authoritative.test.mjs')
text = path.read_text()
text = text.replace('effects:[{type:"damage",amount:2,target:"anyCreature",selections:1}]', 'effects:[{type:"damage",amount:1,target:"anyCreature",selections:1}]', 1)
text = text.replace('find((card)=>card.uid==="ping").damage,2)', 'find((card)=>card.uid==="ping").damage,1)')
path.write_text(text)
