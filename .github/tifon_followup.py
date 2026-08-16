from pathlib import Path
p=Path('tests/rules-engine.test.mjs')
text=p.read_text()
old='assert.equal(explicitRuleIds.length, 251);'
if old not in text:
    raise SystemExit('missing explicit-rule invariant')
p.write_text(text.replace(old,'assert.equal(explicitRuleIds.length, 254);',1))
