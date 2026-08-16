from pathlib import Path

path = Path('tests/quarion-authoritative.test.mjs')
text = path.read_text()
text = text.replace('const host={...printed(189),uid:"ping",slot:0,damage:0,modifiers:[],staticModifiers:[],exhausted:false,summoning:false};', 'const host={...printed(189),uid:"ping",slot:0,hp:10,damage:0,modifiers:[],staticModifiers:[],exhausted:false,summoning:false};')
text = text.replace('find((card)=>card.uid==="ping").damage,1)', 'find((card)=>card.uid==="ping").damage,2)')
path.write_text(text)

path = Path('tests/rules-engine.test.mjs')
text = path.read_text()
old = 'game.players[0].board.push({ uid: "chief", slot: 0, staticModifiers: [{ type: "doubleRecruitEffects" }], abilities: [] });'
new = 'game.players[0].board.push({ uid: "chief", id: "p182", page: 182, name: "Chefe da Guarda", type: "Criatura", slot: 0, subtypes: [], staticModifiers: [{ type: "doubleRecruitEffects" }], abilities: [] });'
assert old in text
text = text.replace(old, new)
path.write_text(text)
