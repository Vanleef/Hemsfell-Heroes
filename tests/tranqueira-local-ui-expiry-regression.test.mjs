import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("local end-turn removes every live Tranqueira using its own counter", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /liveTranqueiras=p\.support\.filter\(x=>x\.page===46\)/);
  assert.match(page, /cardsPlayedAfterSelf/);
  assert.match(page, /p\.support=p\.support\.filter\(x=>x\.page!==46\)/);
  assert.match(page, /liveTranqueiras\.forEach\(x=>sendToGrave\(g,p,x\)\)/);
  assert.match(page, /else if\(p\.pendingTranqueira\)/);
});
