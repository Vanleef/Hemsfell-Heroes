import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page,route,machine]=await Promise.all([
  readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/api/rooms/[id]/route.ts",import.meta.url),"utf8"),
  readFile(new URL("../app/api/rooms/machine.ts",import.meta.url),"utf8"),
]);

test("mulligan decisions are idempotent and retry heartbeat revision races",()=>{
  assert.match(machine,/lastMulliganRequestId\?: string/);
  assert.match(page,/const mulliganRequestId=crypto\.randomUUID\(\)/);
  assert.match(page,/roomAction\("mulligan",\{keep,mulliganRequestId\}\)/);
  assert.match(page,/action==="select"\|\|action==="mulligan"/);
  assert.match(route,/current\.lastMulliganRequestId === mulliganRequestId/);
  assert.match(route,/current\.lastMulliganRequestId = mulliganRequestId/);
});

test("mulligan UI ignores regressive snapshots and actively expires its deadline",()=>{
  assert.match(page,/incomingRevision<roomRevisionRef\.current\)return false/);
  assert.match(page,/const key=`mulligan-\$\{deadline\}`/);
  assert.match(page,/void roomAction\("timeout"\)/);
  assert.match(page,/pending=\{mulliganActionPending\}/);
  assert.match(page,/pending\?"Confirmando…"/);
});
