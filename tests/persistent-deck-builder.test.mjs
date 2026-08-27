import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
const model=await readFile(new URL("../app/user-deck.mjs",import.meta.url),"utf8");
const matchCss=await readFile(new URL("../app/match-ui.css",import.meta.url),"utf8");

test("deck builder hydrates and persists only validated deck snapshots",()=>{
 assert.match(page,/USER_DECK_STORAGE_KEY/);
 assert.match(page,/localStorage\.getItem\(USER_DECK_STORAGE_KEY\)/);
 assert.match(page,/validateUserDeckDraft\(candidates\[deck\.id\],cards\)/);
 assert.match(page,/validateUserDeckDraft\(userDecks\[deck\.id\],cards\)/);
 assert.match(page,/validation\.ok&&validation\.deck/);
 assert.match(page,/localStorage\.setItem\(USER_DECK_STORAGE_KEY/);
});

test("deck builder has pointer drag and accessible button fallbacks",()=>{
 assert.match(page,/onDragStart=\{\(\)=>setDeckDrag/);
 assert.match(page,/handleDeckDrop\("main"\)/);
 assert.match(page,/handleDeckDrop\("extra"\)/);
 assert.match(page,/if\(drag\.zone===target\)return/);
 assert.ok(page.includes("Adicionar uma cópia"));
 assert.ok(page.includes("Remover uma cópia"));
 assert.match(page,/undoActiveDeck/);
});

test("collection cards expose direct reversible controls and useful filters",()=>{
 assert.match(page,/function DeckQuantityControls/);
 assert.match(page,/quantity=\{quantity\}/);
 assert.match(page,/collectionMembership/);
 assert.match(page,/collectionSort/);
 assert.match(page,/Limpar filtros/);
 assert.match(page,/clearActiveDeck/);
 assert.match(page,/aria-pressed=\{inExtra\}/);
 assert.match(page,/Rascunho salvo/);
});

test("all enabled buttons expose hover, active and keyboard focus feedback",()=>{
 assert.match(matchCss,/button:where\(:not\(:disabled\)\):hover/);
 assert.match(matchCss,/button:where\(:not\(:disabled\)\):active/);
 assert.match(matchCss,/button:focus-visible/);
 assert.match(matchCss,/button:disabled\{cursor:not-allowed\}/);
});

test("online and bot matches consume the validated UserDeck",()=>{
 assert.match(page,/roomAction\("select",\{heroId,userDeck:validation\.deck/);
 assert.match(page,/start\(mine,enemy,0,30,mineValidation\.deck/);
 assert.match(model,/main deck must contain exactly/);
});
