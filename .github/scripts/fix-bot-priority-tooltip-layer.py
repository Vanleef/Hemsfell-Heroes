from pathlib import Path

page = Path('app/page.tsx')
text = page.read_text(encoding='utf-8')
old = ''' const setSharedResponse=(response:PendingResponse|null,sharedAction:CombatAction|null=combatAction)=>{\n  const timed=response?{...response,deadline:response.deadline??Date.now()+(roomInfo?.settings?.responseSeconds??30)*1000}:null;\n  setResponseWindow(timed);\n  if(mode==="online")update(g=>{g.pendingResponse=timed?{...timed,passes:timed.passes??0}:null;g.combatAction=sharedAction});\n };'''
new = ''' const setSharedResponse=(response:PendingResponse|null,sharedAction:CombatAction|null=combatAction)=>{\n  const timed=response?{...response,deadline:response.deadline??Date.now()+(roomInfo?.settings?.responseSeconds??30)*1000}:null;\n  setResponseWindow(timed);\n  if(mode==="online"){update(g=>{g.pendingResponse=timed?{...timed,passes:timed.passes??0}:null;g.combatAction=sharedAction});return}\n  /* Bot priority must live in the authoritative game snapshot too. Keeping this\n     only in responseWindow made the UI wait forever while the AI inspected a\n     currentGameRef with no pendingResponse and therefore never passed. */\n  const current=currentGameRef.current;if(!current)return;const next=structuredClone(current);\n  next.pendingResponse=timed?{...timed,passes:timed.passes??0}:null;next.combatAction=sharedAction;\n  currentGameRef.current=next;setGame(next);\n };'''
if old not in text:
    raise SystemExit('setSharedResponse anchor not found')
text = text.replace(old, new, 1)
page.write_text(text, encoding='utf-8')

css = Path('app/ui-overrides.css')
css_text = css.read_text(encoding='utf-8')
block = '''\n/* Opponent revealed-card tooltips must render over the opponent energy bar,\n   battlefield slots and permanents. Raise the whole hand stacking context only\n   while a revealed card is hovered so normal board layering is unchanged. */\n.hs-board .opponent-hand { overflow: visible; }\n.hs-board .opponent-hand:has(.original-card:hover) { z-index: 1200 !important; }\n.hs-board .opponent-hand .original-card,\n.hs-board .opponent-hand .original-card:hover { overflow: visible; }\n.hs-board .opponent-hand .original-card:hover .card-tooltip { z-index: 1400 !important; }\n'''
if 'Opponent revealed-card tooltips must render over' not in css_text:
    css_text += block
css.write_text(css_text, encoding='utf-8')

test = Path('tests/bot-priority-sync.test.mjs')
test.write_text('''import assert from "node:assert/strict";\nimport test from "node:test";\nimport fs from "node:fs";\n\ntest("bot response window is mirrored into authoritative game state",()=>{\n  const source=fs.readFileSync(new URL("../app/page.tsx", import.meta.url),"utf8");\n  assert.match(source,/Bot priority must live in the authoritative game snapshot too/);\n  assert.match(source,/next\\.pendingResponse=timed\\?\\{\\.\\.\\.timed,passes:timed\\.passes\\?\\?0\\}:null/);\n  assert.match(source,/currentGameRef\\.current=next;setGame\\(next\\)/);\n});\n\ntest("opponent hand raises its stacking context while a revealed card tooltip is hovered",()=>{\n  const css=fs.readFileSync(new URL("../app/ui-overrides.css", import.meta.url),"utf8");\n  assert.match(css,/\\.hs-board \\.opponent-hand:has\\(\\.original-card:hover\\).*z-index:\\s*1200/s);\n  assert.match(css,/\\.opponent-hand \\.original-card:hover \\.card-tooltip.*z-index:\\s*1400/s);\n});\n''', encoding='utf-8')
