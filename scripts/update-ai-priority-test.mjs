import { readFile, writeFile } from "node:fs/promises";

const path = "tests/ai-priority-lock.test.mjs";
let source = await readFile(path, "utf8");
const start = source.indexOf('test("AI response timer is keyed only to the pending priority window"');
if (start < 0) throw new Error("stale AI priority timer test not found");
const end = source.indexOf("\n});", start);
if (end < 0) throw new Error("stale AI priority timer test end not found");
const replacement = `test("AI response timer is keyed only to the authoritative pending priority window",async()=>{
  const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  const marker=page.match(/useEffect\\(\\(\\)=>\\{const authoritativePending=game\\?\\.pendingResponse[\\s\\S]*?\\},\\[game\\?\\.pendingResponse\\?\\.actor,game\\?\\.pendingResponse\\?\\.responder,game\\?\\.pendingResponse\\?\\.passes,game\\?\\.pendingResponse\\?\\.action,mode,difficulty\\]\\);/)?.[0]||"";
  assert.ok(marker);
  assert.match(marker,/currentGameRef\\.current/);
  assert.match(marker,/chooseAIResponse/);
  assert.match(marker,/command\\.type==="activateHero"/);
  assert.doesNotMatch(marker,/\\[game,responseWindow,mode,difficulty\\]/);
});`;
source = source.slice(0, start) + replacement + source.slice(end + 4);
await writeFile(path, source);
