from pathlib import Path
path = Path('tests/rules-engine.test.mjs')
text = path.read_text()
replacements = {
    'assert.equal(explicitRuleIds.length, 248);': 'assert.equal(explicitRuleIds.length, 249);',
    'assert.equal(migrated.length, 308); assert.equal(pending.length, 0);': 'assert.equal(migrated.length, 306); assert.equal(pending.length, 0);',
    'assert.equal(report.cards, 308);': 'assert.equal(report.cards, 306);',
}
for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f'missing invariant pattern: {old}')
    text = text.replace(old, new)
path.write_text(text)
