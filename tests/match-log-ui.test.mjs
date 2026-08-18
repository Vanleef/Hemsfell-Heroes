import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("match UI imports the dedicated responsive match history styles",async()=>{
  const entry=await readFile(new URL("../app/match-ui.css",import.meta.url),"utf8");
  assert.match(entry,/@import "\.\/match-log\.css";/);
});

test("match history replaces the old test label and remains responsive",async()=>{
  const css=await readFile(new URL("../app/match-log.css",import.meta.url),"utf8");
  assert.match(css,/content:"Registro da partida"/);
  assert.match(css,/width:clamp\(/);
  assert.match(css,/container-type:inline-size/);
  assert.match(css,/@container \(max-width:20rem\)/);
  assert.match(css,/\.events p\.priority/);
  assert.match(css,/overscroll-behavior:contain/);
});
