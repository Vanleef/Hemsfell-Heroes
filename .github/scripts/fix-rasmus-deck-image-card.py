from pathlib import Path
import json

# 1) Restore the playable non-Image Café Expresso card that was incorrectly
# removed together with the generated Image duplicate. Keep p230 as Image-only.
cards_path = Path('app/cards.generated.json')
cards = json.loads(cards_path.read_text(encoding='utf-8'))
if not any(card.get('page') == 234 for card in cards):
    cards.append({
        'page': 234,
        'id': 'p234',
        'name': 'Café Expresso Simples',
        'type': 'Feitiço',
        'cost': 1,
        'text': 'Desvire a criatura alvo. Ela ganha +1/+1 até o fim do turno. "Aproveite enquanto está quente"',
        'tags': [],
        'image': 'drive://1gI26HASPp9KM_GtloaqBIj8ukY7Nq3CC/page/234',
        'hero': False,
        'imageCard': False,
    })
cards.sort(key=lambda card: card.get('page', 10**9))
cards_path.write_text(json.dumps(cards, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# 2) Restore the executable rule for p234, but make both consequences reuse
# the same single selected creature.
rules_path = Path('app/rules-engine/card-rules.mjs')
s = rules_path.read_text(encoding='utf-8')
old = '  p234: { ignored: true, reason: "removed-from-catalog" },'
new = '  p234: [ability("onPlay", [effect("ready", { target: "anyCreature", selections: 1 }), effect("modifyStats", { target: "anyCreature", attack: 1, health: 1, duration: "turn", reusePreviousTarget: true })])],'
if old not in s:
    raise SystemExit('p234 rule anchor not found')
rules_path.write_text(s.replace(old, new, 1), encoding='utf-8')

# 3) Fix the supplied Rasmus deck: p230 is an Image and must never be shuffled
# into the main deck. The author list's Café Expresso Simples is p234.
page_path = Path('app/page.tsx')
s = page_path.read_text(encoding='utf-8')
old = 'rasmus:[[221,3],[245,3],[244,2],[217,3],[215,3],[246,3],[247,3],[216,3],[214,2],[250,2],[225,3],[249,3],[252,3],[230,3],[254,2],[212,1],[229,3],[251,2],[235,2]]'
new = 'rasmus:[[221,3],[245,3],[244,2],[217,3],[215,3],[246,3],[247,3],[216,3],[214,2],[250,2],[225,3],[249,3],[252,3],[234,3],[254,2],[212,1],[229,3],[251,2],[235,2]]'
if old not in s:
    raise SystemExit('Rasmus deck anchor not found')
page_path.write_text(s.replace(old, new, 1), encoding='utf-8')

# 4) Update regressions that encoded the previous mistaken removal / p230 deck entry.
rasmus_test = Path('tests/rasmus-authoritative.test.mjs')
s = rasmus_test.read_text(encoding='utf-8')
old = 'test("canonical Rasmus duplicate cards are removed",()=>{assert.equal(cards.some(card=>card.page===233),false);assert.equal(cards.some(card=>card.page===234),false);assert.equal(cards.find(card=>card.page===213)?.name,"Gato Multidimensional");assert.equal(cards.find(card=>card.page===230)?.imageCard,true);});'
new = 'test("Rasmus generated Images stay out of the playable main-deck catalog entries",()=>{assert.equal(cards.some(card=>card.page===233),false);assert.equal(cards.find(card=>card.page===213)?.name,"Gato Multidimensional");assert.equal(cards.find(card=>card.page===230)?.imageCard,true);assert.equal(cards.find(card=>card.page===234)?.name,"Café Expresso Simples");assert.equal(cards.find(card=>card.page===234)?.imageCard,false);});'
if old not in s:
    raise SystemExit('Rasmus canonical-card regression anchor not found')
rasmus_test.write_text(s.replace(old, new, 1), encoding='utf-8')

priority_test = Path('tests/rasmus-coffee-priority-regressions.test.mjs')
s = priority_test.read_text(encoding='utf-8')
s = s.replace('[252,3],[230,3],[254,2]', '[252,3],[234,3],[254,2]')
priority_test.write_text(s, encoding='utf-8')

# 5) Add a direct regression guaranteeing no supplied Rasmus main-deck page is an Image.
Path('tests/rasmus-deck-no-images.test.mjs').write_text('''import assert from "node:assert/strict";\nimport test from "node:test";\nimport fs from "node:fs";\nimport cards from "../app/cards.generated.json" with { type: "json" };\n\nconst source=fs.readFileSync(new URL("../app/page.tsx", import.meta.url),"utf8");\n\ntest("Rasmus supplied deck contains 49 real cards and zero Images",()=>{\n  const match=source.match(/rasmus:\\[(.*?)\\],\\n ngoro:/s);\n  assert.ok(match);\n  const pairs=[...match[1].matchAll(/\\[(\\d+),(\\d+)\\]/g)].map(entry=>[Number(entry[1]),Number(entry[2])]);\n  assert.equal(pairs.reduce((sum,[,qty])=>sum+qty,0),49);\n  for(const [page] of pairs){\n    const card=cards.find(item=>item.page===page);\n    assert.ok(card,`missing page ${page}`);\n    assert.equal(card.imageCard,false,`${card.name} (p${page}) must not be an Image in Rasmus main deck`);\n  }\n  assert.ok(pairs.some(([page])=>page===234));\n  assert.ok(!pairs.some(([page])=>page===230));\n});\n''', encoding='utf-8')
