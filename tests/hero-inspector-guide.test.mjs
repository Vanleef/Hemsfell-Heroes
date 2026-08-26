import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const runtime=fs.readFileSync(new URL("../app/match-ui-runtime.tsx",import.meta.url),"utf8");

test("hero inspector resolves guide by canonical hero page",()=>{
 assert.match(source,/const deckByHeroPage=\(page:number\)=>deckDefs\.find\(d=>d\.heroPage===page\)/);
 assert.match(source,/deckByHeroPage\(showInspector\.page\)\?<div className="inspector-hero-guide"/);
 assert.doesNotMatch(source,/showInspector\.name===deck\.name\|\|showInspector\.name\.startsWith/);
});

test("hero inspector uses structured HeroGuide with consolidated runtime fallback",()=>{
 const inspector=source.slice(source.indexOf('{showInspector&&<div className="overlay inspector'),source.indexOf('function MulliganModal'));
 assert.match(inspector,/HeroGuide deck=\{deckByHeroPage\(showInspector\.page\)!\}/);
 assert.match(inspector,/deckByHeroPage\(showInspector\.page\)\?[\s\S]*?:<>/);
 assert.ok(inspector.indexOf('EFEITO COMPLETO')>inspector.indexOf(':<>'));
 assert.match(runtime,/const HERO_GUIDES:/);
 assert.match(runtime,/canonical-runtime-guide/);
 assert.match(runtime,/useHeroInspectorCanonicalizer/);
});

test("Rasmus canonical hero title keeps the printed article",()=>{
 assert.match(source,/name:"Rasmus, o Barista do Tempo"/);
});
