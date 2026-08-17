import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");

test("hero inspector resolves guide by canonical hero page",()=>{
 assert.match(source,/const deckByHeroPage=\(page:number\)=>deckDefs\.find\(d=>d\.heroPage===page\)/);
 assert.match(source,/showInspector\.hero&&deckByHeroPage\(showInspector\.page\)/);
 assert.doesNotMatch(source,/showInspector\.name===deck\.name\|\|showInspector\.name\.startsWith/);
});

test("hero inspector uses HeroGuide instead of legacy raw effect sections",()=>{
 const inspector=source.slice(source.indexOf('{showInspector&&<div className="overlay inspector'),source.indexOf('function CombatAnimation'));
 assert.match(inspector,/HeroGuide deck=\{deckByHeroPage\(showInspector\.page\)!\}/);
 assert.match(inspector,/showInspector\.hero&&deckByHeroPage[\s\S]*?:<>/);
 assert.ok(inspector.indexOf('EFEITO COMPLETO')>inspector.indexOf(':<>'));
});

test("Rasmus canonical hero title keeps the printed article",()=>{
 assert.match(source,/name:"Rasmus, o Barista do Tempo"/);
});
