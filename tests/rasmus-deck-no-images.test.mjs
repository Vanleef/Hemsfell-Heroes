import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import cards from "../app/cards.generated.json" with { type: "json" };

const source=fs.readFileSync(new URL("../app/page.tsx", import.meta.url),"utf8");

test("Rasmus supplied deck contains 49 real cards and zero Images",()=>{
  const match=source.match(/rasmus:\[(.*?)\],\n ngoro:/s);
  assert.ok(match);
  const pairs=[...match[1].matchAll(/\[(\d+),(\d+)\]/g)].map(entry=>[Number(entry[1]),Number(entry[2])]);
  assert.equal(pairs.reduce((sum,[,qty])=>sum+qty,0),49);
  for(const [page] of pairs){
    const card=cards.find(item=>item.page===page);
    assert.ok(card,`missing page ${page}`);
    assert.equal(card.imageCard,false,`${card.name} (p${page}) must not be an Image in Rasmus main deck`);
  }
  assert.ok(pairs.some(([page])=>page===234));
  assert.ok(!pairs.some(([page])=>page===230));
});
