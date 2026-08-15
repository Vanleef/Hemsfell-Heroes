from pathlib import Path

page=Path('app/page.tsx')
s=page.read_text(encoding='utf-8')
old='''  const current=currentGameRef.current;if(!current)return;const next=structuredClone(current);\n  next.pendingResponse=timed?{...timed,passes:timed.passes??0}:null;next.combatAction=sharedAction;\n  currentGameRef.current=next;setGame(next);'''
new='''  /* Queue this mutation against React's latest game value instead of cloning\n     currentGameRef synchronously. Actions such as hero evolution update the\n     game and immediately open priority; cloning the ref here could restore the\n     pre-action snapshot and silently undo the evolution. */\n  setGame(old=>{if(!old)return old;const next=structuredClone(old);next.pendingResponse=timed?{...timed,passes:timed.passes??0}:null;next.combatAction=sharedAction;currentGameRef.current=next;return next});'''
if old not in s: raise SystemExit('setSharedResponse anchor not found')
s=s.replace(old,new,1)
page.write_text(s,encoding='utf-8')

css=Path('app/ui-overrides.css')
c=css.read_text(encoding='utf-8')
block='''\n\n/* Slightly denser command-bar typography: preserve the existing responsive\n   geometry while giving long hero abilities more breathing room. */\n.screen-game .hero-command-bar .hero-ability-chip p{font-size:clamp(.255rem,3.72cqi,.455rem)!important;line-height:1.06!important}\n.screen-game .hero-command-bar .hero-ability-chip>span>b{font-size:clamp(.235rem,3.35cqi,.385rem)!important}\n.screen-game .hero-command-bar .hero-ability-chip.copy-compact p{font-size:clamp(.245rem,3.35cqi,.415rem)!important}\n.screen-game .hero-command-bar .hero-ability-chip.copy-dense p{font-size:clamp(.225rem,2.95cqi,.37rem)!important}\n'''
if 'Slightly denser command-bar typography' not in c:c+=block
css.write_text(c,encoding='utf-8')

Path('tests/hero-level-race.test.mjs').write_text('''import assert from "node:assert/strict";\nimport test from "node:test";\nimport fs from "node:fs";\n\ntest("bot response synchronization cannot overwrite a just-applied hero evolution",()=>{\n const source=fs.readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");\n assert.match(source,/setGame\\(old=>\\{if\\(!old\\)return old;const next=structuredClone\\(old\\);next\\.pendingResponse=/);\n assert.doesNotMatch(source,/const current=currentGameRef\\.current;if\\(!current\\)return;const next=structuredClone\\(current\\);\\s*next\\.pendingResponse/);\n assert.match(source,/const levelUp=\\(\\)=>\\{[^}]*heroEvolutionProgress\\(p\\)/s);\n});\n\ntest("Ngoro evolution still uses current clue progress and 5\/10 thresholds",()=>{\n const source=fs.readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");\n assert.match(source,/id:\"ngoro\"[^\\n]*requirement:\"5\\/10 Pistas\"/);\n assert.match(source,/heroEvolutionProgress=\\(player:Player\\)=>[^\\n]*return player\\.heroXP/);\n assert.match(source,/heroTarget && key === \"clue\"|heroTarget&&key===\"clue\"/);\n});\n\ntest("command bar typography remains responsive and slightly smaller",()=>{\n const css=fs.readFileSync(new URL("../app/ui-overrides.css",import.meta.url),"utf8");\n assert.match(css,/Slightly denser command-bar typography/);\n assert.match(css,/hero-command-bar \\.hero-ability-chip p\\{font-size:clamp\\(\\.255rem,3\\.72cqi,\\.455rem\\)/);\n});\n''',encoding='utf-8')
