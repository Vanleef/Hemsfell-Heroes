import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("graveyard uses printed cards and its own copy instead of the Extra Deck labels", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /function CardZoneModal/);
  assert.match(page, /displayCards=grave\?cards\.map\(baseCard\):cards/);
  assert.match(page, /CARTAS NO CEMITÉRIO/);
  assert.match(page, /Este Cemitério está vazio/);
});

test("collection exposes copy counts and bounded responsive lists", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui-overrides.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /collectionQuantity:entry\.quantity/);
  assert.match(page, /activeUserDeck\.main\.map/);
  assert.match(page, /collection-copy-count/);
  assert.match(css, /screen-decks \.collection-lists[^}]*overflow: hidden !important/s);
  assert.match(css, /card-library:has\(> :nth-child\(21\)\)/);
});

test("local assisted priority uses authoritative legal responses and expires safely", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /legalAcceleratedResponseCommands=.*legalPriorityResponses/);
  assert.match(page, /if\(next\.pendingResponse&&!next\.pendingResponse\.deadline\)/);
  assert.match(page, /mode!=="bot"\|\|pending\?\.responder!==0/);
});


test("graveyard and Extra Deck cards can open detailed inspection", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const modal = page.match(/function CardZoneModal[\s\S]*?function SearchDeckModal/)?.[0] ?? "";
  assert.ok(modal, "expected CardZoneModal source");
  assert.match(modal, /<OriginalCard[^>]*card=\{card\}[^>]*small[^>]*inspectable\s*\/>/);
  assert.doesNotMatch(modal, /inspectable=\{false\}/);
  assert.match(page, /hemsfell:inspect-card/);
  assert.match(page, /setShowInspector/);
});
