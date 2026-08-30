import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

test("bot response synchronization cannot overwrite a just-applied hero evolution",()=>{
 const source=fs.readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
 assert.match(source,/setGame\(old=>\{if\(!old\)return old;const next=structuredClone\(old\);next\.pendingResponse=/);
 assert.doesNotMatch(source,/const current=currentGameRef\.current;if\(!current\)return;const next=structuredClone\(current\);\s*next\.pendingResponse/);
 assert.match(source,/const levelUp=\(\)=>\{[^}]*heroEvolutionProgress\(p\)/s);
});

test("Ngoro evolution still uses current clue progress and 5/10 thresholds",()=>{
 const source=fs.readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
 assert.match(source,/id:"ngoro"[^\n]*requirement:"5\/10 Pistas"/);
 assert.match(source,/heroEvolutionProgress=\(player:Player\)=>[^\n]*return player\.heroXP/);
});

test("command bar typography remains responsive and slightly smaller",()=>{
 const css=fs.readFileSync(new URL("../app/presentation/styles/base/ui-overrides.css",import.meta.url),"utf8");
 assert.match(css,/Slightly denser command-bar typography/);
 assert.match(css,/hero-command-bar \.hero-ability-chip p\{font-size:clamp\(\.255rem,3\.72cqi,\.455rem\)/);
});
