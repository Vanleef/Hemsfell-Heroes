import { readFile, writeFile } from "node:fs/promises";

const pagePath = "app/page.tsx";
let page = await readFile(pagePath, "utf8");
const before = ' const handleDeckDrop=(target:"collection"|"main"|"extra")=>{const drag=deckDrag;if(!drag)return;setDeckDrag(null);if(target==="collection"){if(drag.zone==="main")setMainQuantity(drag.cardId,selectedMainQuantity(drag.cardId)-1);else if(drag.zone==="extra")toggleExtraCard(drag.cardId,false);return}if(target==="main")addDeckCard(drag.cardId,"main");else addDeckCard(drag.cardId,"extra")};';
const after = ' const handleDeckDrop=(target:"collection"|"main"|"extra")=>{const drag=deckDrag;if(!drag)return;setDeckDrag(null);if(drag.zone===target)return;if(target==="collection"){if(drag.zone==="main")setMainQuantity(drag.cardId,selectedMainQuantity(drag.cardId)-1);else if(drag.zone==="extra")toggleExtraCard(drag.cardId,false);return}if(target==="main")addDeckCard(drag.cardId,"main");else addDeckCard(drag.cardId,"extra")};';
if (!page.includes(before)) throw new Error("Deck drop handler patch point not found");
page = page.replace(before, after);
await writeFile(pagePath, page);

const testPath = "tests/persistent-deck-builder.test.mjs";
let test = await readFile(testPath, "utf8");
const testBefore = ' assert.match(page,/handleDeckDrop\\("extra"\\)/);\n';
const testAfter = ' assert.match(page,/handleDeckDrop\\("extra"\\)/);\n assert.match(page,/if\\(drag\\.zone===target\\)return/);\n';
if (!test.includes(testBefore)) throw new Error("Persistent builder drag audit patch point not found");
test = test.replace(testBefore, testAfter);
await writeFile(testPath, test);
