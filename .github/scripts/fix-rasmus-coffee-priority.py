from pathlib import Path

# 1) Café Preto Sem Açúcar: +5/+5 until controller's next turn, without skipping untap.
rules = Path('app/rules-engine/card-rules.mjs')
s = rules.read_text(encoding='utf-8')
old = '  p249: [ability("onPlay", [effect("modifyStats", { target: "anyCreature", attack: 5, health: 5, duration: "untilNextTurn" }), effect("skipNextUntap", { target: "anyCreature" })])],'
new = '  p249: [ability("onPlay", [effect("modifyStats", { target: "anyCreature", selections: 1, attack: 5, health: 5, duration: "untilNextTurn" })])],'
if old not in s:
    raise SystemExit('p249 anchor not found')
s = s.replace(old, new, 1)
rules.write_text(s, encoding='utf-8')

# 2) Exact 49-card Rasmus list supplied by the author.
page = Path('app/page.tsx')
s = page.read_text(encoding='utf-8')
old = ' quarion:[[184,3],[189,3],[186,3],[188,3],[183,3],[190,3],[187,3],[185,3],[182,2],[193,2],[197,2],[194,2],[196,2],[195,2],[192,2],[153,2],[150,2],[151,3],[191,2],[181,2]],\n ngoro:[[256,3],[257,3],[260,3],[259,3],[262,3],[258,3],[261,3],[264,3],[263,3],[266,3],[265,3],[269,3],[267,3],[268,3],[270,3],[271,2],[272,2]],'
new = ' quarion:[[184,3],[189,3],[186,3],[188,3],[183,3],[190,3],[187,3],[185,3],[182,2],[193,2],[197,2],[194,2],[196,2],[195,2],[192,2],[153,2],[150,2],[151,3],[191,2],[181,2]],\n rasmus:[[221,3],[245,3],[244,2],[217,3],[215,3],[246,3],[247,3],[216,3],[214,2],[250,2],[225,3],[249,3],[252,3],[230,3],[254,2],[212,1],[229,3],[251,2],[235,2]],\n ngoro:[[256,3],[257,3],[260,3],[259,3],[262,3],[258,3],[261,3],[264,3],[263,3],[266,3],[265,3],[269,3],[267,3],[268,3],[270,3],[271,2],[272,2]],'
if old not in s:
    raise SystemExit('supplied deck anchor not found')
s = s.replace(old, new, 1)

# 3) Legacy bot response window: open it only when the authoritative priority engine
# finds at least one legal AI response. This prevents permanent "avaliando prioridade"
# states after cards such as Pinga que Levanta Defunto when the bot cannot respond.
old = '  if(mode!=="online"){if(asResponse)setSharedResponse(null);else window.setTimeout(()=>setSharedResponse({responder:owner===0?1:0,actor:owner,action:snapshot.name}),1550)}'
new = '''  if(mode!=="online"){if(asResponse)setSharedResponse(null);else window.setTimeout(()=>{const responder=(owner===0?1:0) as 0|1,current=currentGameRef.current;if(!current)return;const pending:PendingResponse={responder,actor:owner,action:snapshot.name,passes:0};if(mode==="bot"){const probe={...current,pendingResponse:pending} as Game;if(legalPriorityResponses(probe,responder).length===0){setSharedResponse(null);return}}setSharedResponse(pending)},1550)}'''
if old not in s:
    raise SystemExit('legacy response scheduling anchor not found')
s = s.replace(old, new, 1)
page.write_text(s, encoding='utf-8')

# Focused regressions.
test = Path('tests/rasmus-coffee-priority-regressions.test.mjs')
test.write_text(r'''import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { explicitCardRules } from "../app/rules-engine/card-rules.mjs";

const pageSource = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("Café Preto Sem Açúcar grants exactly one target +5/+5 until next turn without skipping untap", () => {
  const rule = explicitCardRules.p249?.[0];
  assert.equal(rule?.trigger, "onPlay");
  assert.equal(rule?.effects?.length, 1);
  const effect = rule.effects[0];
  assert.equal(effect.type, "modifyStats");
  assert.equal(effect.target, "anyCreature");
  assert.equal(effect.selections, 1);
  assert.equal(effect.attack, 5);
  assert.equal(effect.health, 5);
  assert.equal(effect.duration, "untilNextTurn");
  assert.ok(!rule.effects.some((item) => item.type === "skipNextUntap"));
});

test("Rasmus supplied deck matches the author list and totals exactly 49 cards", () => {
  const match = pageSource.match(/rasmus:\[(.*?)\],\n ngoro:/s);
  assert.ok(match, "Rasmus supplied deck must exist");
  const pairs = [...match[1].matchAll(/\[(\d+),(\d+)\]/g)].map((entry) => [Number(entry[1]), Number(entry[2])]);
  const expected = [[221,3],[245,3],[244,2],[217,3],[215,3],[246,3],[247,3],[216,3],[214,2],[250,2],[225,3],[249,3],[252,3],[230,3],[254,2],[212,1],[229,3],[251,2],[235,2]];
  assert.deepEqual(pairs, expected);
  assert.equal(pairs.reduce((sum, [, quantity]) => sum + quantity, 0), 49);
});

test("bot legacy priority window is skipped when the authoritative engine has no legal response", () => {
  assert.match(pageSource, /const probe=\{\.\.\.current,pendingResponse:pending\} as Game/);
  assert.match(pageSource, /legalPriorityResponses\(probe,responder\)\.length===0/);
  assert.match(pageSource, /setSharedResponse\(null\);return/);
});
''', encoding='utf-8')
