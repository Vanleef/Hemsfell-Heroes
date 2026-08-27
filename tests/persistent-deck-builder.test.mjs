import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
const model=await readFile(new URL("../app/user-deck.mjs",import.meta.url),"utf8");
const matchCss=await readFile(new URL("../app/match-ui.css",import.meta.url),"utf8");
const commandCss=await readFile(new URL("../app/command-bar-fixes.css",import.meta.url),"utf8");
const runtime=await readFile(new URL("../app/match-ui-runtime.tsx",import.meta.url),"utf8");

test("collection is read-only and exposes only the selected canonical deck",()=>{
 assert.doesNotMatch(page,/USER_DECK_STORAGE_KEY/);
 assert.doesNotMatch(page,/localStorage\.setItem\(USER_DECK_STORAGE_KEY/);
 assert.doesNotMatch(page,/DeckQuantityControls/);
 assert.doesNotMatch(page,/setDeckDrag/);
 assert.doesNotMatch(page,/collectionMembership/);
 assert.doesNotMatch(page,/collectionSort/);
 assert.doesNotMatch(page,/Coleção disponível/);
 assert.doesNotMatch(page,/Nome do deck/);
 assert.ok(page.includes("COLEÇÃO DE HERÓIS"));
 assert.ok(page.includes("Deck Principal"));
 assert.ok(page.includes("Deck Extra"));
 assert.match(page,/HeroGuide deck=\{selectedDeck\}/);
 assert.match(page,/collectionQuantity:entry\.quantity/);
});

test("read-only collection keeps search, type filter and card inspection",()=>{
 assert.match(page,/collectionQuery/);
 assert.match(page,/collectionType/);
 assert.match(page,/Buscar cartas/);
 assert.match(page,/setShowInspector\(c\)/);
 assert.match(page,/filteredSelectedPool/);
 assert.match(page,/filteredSelectedExtra/);
});

test("command bar keeps production text inside a readable floor",()=>{
 assert.match(commandCss,/Production command-bar readability guard/);
 assert.match(commandCss,/flex:1 1 0!important/);
 assert.match(commandCss,/game-stage>\\.game-content\\.hs-board \\.hero-command-bar/);
 assert.match(runtime,/COMMAND_COPY_SIZE = "clamp\\(\\.74rem/);
 assert.match(runtime,/COMMAND_TITLE_SIZE = "clamp\\(\\.62rem/);
 assert.match(runtime,/setProperty\\("font-size", descriptionSize, "important"\\)/);
 assert.match(runtime,/commandTextFit = "readable"/);
 assert.doesNotMatch(runtime,/minimumScale/);
});

test("all enabled buttons expose hover, active and keyboard focus feedback",()=>{
 assert.match(matchCss,/button:where\(:not\(:disabled\)\):hover/);
 assert.match(matchCss,/button:where\(:not\(:disabled\)\):active/);
 assert.match(matchCss,/button:focus-visible/);
 assert.match(matchCss,/button:disabled\{cursor:not-allowed\}/);
});

test("online and bot matches consume the validated canonical UserDeck",()=>{
 assert.match(page,/const userDecks=useMemo<Record<DeckId,UserDeck>>\(\(\)=>createDefaultUserDecks\(\),\[\]\)/);
 assert.match(page,/roomAction\("select",\{heroId,userDeck:validation\.deck/);
 assert.match(page,/start\(mine,enemy,0,30,mineValidation\.deck/);
 assert.match(model,/main deck must contain exactly/);
});
