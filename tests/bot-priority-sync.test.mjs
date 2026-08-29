import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

test("bot response window is mirrored into authoritative game state",()=>{
  const source=fs.readFileSync(new URL("../app/page.tsx", import.meta.url),"utf8");
  assert.match(source,/Bot priority must live in the authoritative game snapshot too/);
  assert.match(source,/next\.pendingResponse=timed\?\{\.\.\.timed,passes:timed\.passes\?\?0\}:null/);
  assert.match(source,/currentGameRef\.current=next;setGame\(next\)/);
});

test("opponent hand raises its stacking context while a revealed card tooltip is hovered",()=>{
  const css=fs.readFileSync(new URL("../app/presentation/styles/base/ui-overrides.css", import.meta.url),"utf8");
  assert.match(css,/\.hs-board \.opponent-hand:has\(\.original-card:hover\).*z-index:\s*1200/s);
  assert.match(css,/\.opponent-hand \.original-card:hover \.card-tooltip.*z-index:\s*1400/s);
});
