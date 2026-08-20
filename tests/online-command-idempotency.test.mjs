import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [machine, route, page] = await Promise.all([
  readFile(new URL("../app/api/rooms/machine.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/rooms/[id]/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
]);

test("authoritative room commands deduplicate a previously accepted command id before stale revision checks", () => {
  assert.match(machine, /recentCommandIds\?: string\[\]/);
  assert.match(machine, /export function applyRulesCommand\([^)]*commandId: unknown/);
  const duplicateIndex = machine.indexOf("recentCommandIds?.includes(normalizedCommandId)");
  const staleIndex = machine.indexOf("Number(baseRevision) !== room.revision", machine.indexOf("export function applyRulesCommand"));
  assert.ok(duplicateIndex > 0 && staleIndex > duplicateIndex, "duplicate recognition must happen before the stale-revision rejection");
  assert.match(machine, /recentCommandIds = \[\.\.\.recent\.filter\(\(value\) => value !== normalizedCommandId\), normalizedCommandId\]\.slice\(-128\)/);
});

test("room route forwards the stable command id to the authoritative machine", () => {
  assert.match(route, /applyRulesCommand\(room, role, body\.command, body\.baseRevision, body\.commandId\)/);
});

test("duplicate command acknowledgement returns the persisted room without another storage write", () => {
  const duplicateIndex = route.indexOf("if (resolution.duplicate) return NextResponse.json(roomView(room, true, role), noStore)");
  const writeIndex = route.indexOf("await writeRoom(room)", duplicateIndex);
  assert.ok(duplicateIndex > 0 && writeIndex > duplicateIndex, "duplicate retry must return before the shared write path");
});

test("canonical Online client attaches one stable id per logical command", () => {
  assert.match(page, /const commandId=crypto\.randomUUID\(\);const result=await roomAction\("command",\{command,commandId/);
});
