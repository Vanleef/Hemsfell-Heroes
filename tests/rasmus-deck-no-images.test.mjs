import assert from "node:assert/strict";
import test from "node:test";
import cards from "../app/cards.generated.json" with { type: "json" };
import { suppliedDeckPages } from "../app/user-deck.mjs";

test("Rasmus supplied deck contains 49 real cards and zero Images",()=>{
  const pairs=suppliedDeckPages.rasmus;
  assert.ok(pairs,"Rasmus supplied deck must exist");
  assert.equal(pairs.reduce((sum,[,qty])=>sum+qty,0),49);
  for(const [page] of pairs){
    const card=cards.find(item=>item.page===page);
    assert.ok(card,`missing page ${page}`);
    assert.equal(card.imageCard,false,`${card.name} (p${page}) must not be an Image in Rasmus main deck`);
  }
  assert.ok(pairs.some(([page])=>page===234));
  assert.ok(!pairs.some(([page])=>page===230));
});
