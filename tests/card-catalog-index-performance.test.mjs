import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("canonical card lookups use page and id maps instead of repeated linear scans", () => {
  assert.match(page, /const cardsByPage=new Map<number,CardDef>/);
  assert.match(page, /const cardsById=new Map<string,CardDef>/);
  assert.match(page, /cardsByPage\.get\(/);
  assert.match(page, /cardsById\.get\(/);
  assert.doesNotMatch(page, /cards\.find\((?:card|candidate)=>(?:card|candidate)\.(?:page|id)===/);
});
