from pathlib import Path
path=Path('tests/quarion-authoritative.test.mjs')
text=path.read_text()
text=text.replace('find((card)=>card.uid==="ping").damage,2)', 'find((card)=>card.uid==="ping").damage,1)')
path.write_text(text)
