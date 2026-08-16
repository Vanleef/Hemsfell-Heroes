from pathlib import Path

path = Path('app/rules-engine/effects.mjs')
text = path.read_text()
old = '      const spellDamageImmune = context.effectSource?.type === "Feitiço" && targetOwner >= 0 && (player(state, targetOwner).support || []).some((attachment) => attachment.attachedTo === (target.uid || target.id) && !attachment.suffocated && (attachment.staticModifiers || []).some((modifier) => modifier.type === "attachedSpellDamageImmunity" && (modifier.requiredPage == null || target.page === modifier.requiredPage)));'
new = '      const spellDamageImmune = context.effectSource?.type === "Feitiço" && targetOwner >= 0 && (player(state, targetOwner).support || []).some((attachment) => attachment.attachedTo === (target.uid || target.id) && !attachment.suffocated && attachment.page === 192 && target.page === 189);'
assert old in text
path.write_text(text.replace(old, new))
