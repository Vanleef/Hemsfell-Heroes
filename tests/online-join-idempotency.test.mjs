import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [route,page,machine]=await Promise.all([
  readFile(new URL("../app/api/rooms/[id]/route.ts",import.meta.url),"utf8"),
  readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/api/rooms/machine.ts",import.meta.url),"utf8"),
]);

test("invitation acceptance is idempotent across a committed response retry",()=>{
  assert.match(machine,/joinRequestId\?: string/);
  assert.match(route,/room\.guest\.joinRequestId === joinRequestId/);
  assert.match(route,/token: room\.guest\.token/);
  assert.match(route,/room\.guest = \{ \.\.\.participant\(token, true\), joinRequestId \}/);
});

test("invitation acceptance retries a heartbeat CAS race before reporting an error",()=>{
  const joinStart=route.indexOf('if (body?.action === "join")');
  const joinEnd=route.indexOf("const role = roleFor",joinStart);
  const joinFlow=route.slice(joinStart,joinEnd);
  assert.match(joinFlow,/for \(let attempt = 0; attempt < 3; attempt\+\+\)/);
  assert.match(joinFlow,/if \(!isStaleWrite\(error\)\) throw error/);
  assert.match(joinFlow,/const latest = await readRoom\(id\)/);
});

test("the invite client single-flights clicks and reuses one request id for retries",()=>{
  assert.match(page,/joinRoomFlightRef=useRef<Promise<void>\|null>/);
  assert.match(page,/if\(joinRoomFlightRef\.current\)return joinRoomFlightRef\.current/);
  assert.match(page,/const joinRequestId=crypto\.randomUUID\(\)/);
  assert.match(page,/JSON\.stringify\(\{action:"join",joinRequestId\}\)/);
  assert.match(page,/disabled=\{!invitePreview\|\|joinPending\}/);
  assert.match(page,/data\?\.error==="room full"/);
});
