import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ONLINE_CLIENT_COMMAND_TYPES, STRIPPED_AUTHORITY_FIELDS, parseOnlineCommand } from "../app/api/rooms/online-command-schema.mjs";

test("online command schema covers the authoritative HTTP command surface", () => {
  assert.deepEqual([...ONLINE_CLIENT_COMMAND_TYPES].sort(), [
    "activate", "activateHero", "advancePhase", "attack", "confirmReposition",
    "declareAttack", "evolveHero", "maintenanceChoice", "passPriority", "playCard",
    "reposition", "resolveDecision", "selectDefender", "surrender",
  ].sort());
});

test("playCard keeps legal intent and strips browser authority, including arbitrary __ fields", () => {
  const result = parseOnlineCommand({
    type: "playCard",
    cardId: "p61-copy-2",
    slot: 3,
    targetIds: ["enemy-hero"],
    sacrificeIds: ["ally-7"],
    chosenElement: "Água",
    selectedImageName: "Clone de Água",
    cafeEffect: "draw",
    elementalTargetId: "unit-8",
    placementZone: "support",
    owner: 1,
    instanceId: "browser-owned-instance",
    hasPriority: true,
    skipPriority: true,
    auto: true,
    __lockedCost: 0,
    __priorityPayment: { cost: 0 },
    __futureAuthority: "blocked",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.command, {
    type: "playCard",
    cardId: "p61-copy-2",
    slot: 3,
    targetIds: ["enemy-hero"],
    sacrificeIds: ["ally-7"],
    chosenElement: "Água",
    selectedImageName: "Clone de Água",
    cafeEffect: "draw",
    elementalTargetId: "unit-8",
    placementZone: "support",
  });
  for (const field of STRIPPED_AUTHORITY_FIELDS) assert.equal(Object.hasOwn(result.command, field), false, field);
  assert.equal(Object.hasOwn(result.command, "__futureAuthority"), false);
});

test("schemas preserve current maintenance, activation, combat and decision payloads while stripping legacy/internal flags", () => {
  assert.deepEqual(
    parseOnlineCommand({ type: "maintenanceChoice", drawTwo: true, extraEnergy: false }),
    { ok: true, command: { type: "maintenanceChoice", drawTwo: true } },
  );
  assert.deepEqual(parseOnlineCommand({ type: "passPriority", auto: true }), { ok: true, command: { type: "passPriority" } });
  assert.equal(parseOnlineCommand({ type: "activate", sourceId: "unit-1", abilityId: "ring-use", markerAmount: 4, targetIds: ["enemy-2"], sacrificeIds: [] }).ok, true);
  assert.equal(parseOnlineCommand({ type: "activateHero", abilityId: "saymon-level-1", targetIds: ["enemy-hero"] }).ok, true);
  assert.equal(parseOnlineCommand({ type: "selectDefender", attackerId: "atk-1", defenderId: "def-1", targetHero: false }).ok, true);
  assert.deepEqual(parseOnlineCommand({ type: "attack", attackerId: "atk-1", defenderId: "def-1", skipPriority: true }), { ok: true, command: { type: "attack", attackerId: "atk-1", defenderId: "def-1" } });
  assert.equal(parseOnlineCommand({ type: "reposition", moves: [{ sourceId: "unit-1", slot: 4 }] }).ok, true);
  assert.equal(parseOnlineCommand({ type: "resolveDecision", choiceIndex: 1, selectedCardIds: ["card-1"], targetIds: ["unit-2"], markerSelections: [{ id: "unit-3", amount: 2 }], slot: 1, placementZone: "creature" }).ok, true);
});

test("malformed or oversized commands are rejected before the rules engine", () => {
  assert.equal(parseOnlineCommand(null).ok, false);
  assert.equal(parseOnlineCommand({ type: "teleportState", owner: 0 }).code, "UNSUPPORTED_RULES_COMMAND");
  assert.equal(parseOnlineCommand({ type: "playCard" }).ok, false);
  assert.equal(parseOnlineCommand({ type: "maintenanceChoice", drawTwo: "yes" }).ok, false);
  assert.equal(parseOnlineCommand({ type: "reposition", moves: [{ sourceId: "x", slot: 99 }] }).ok, false);
  assert.equal(parseOnlineCommand({ type: "resolveDecision", selectedCardIds: Array.from({ length: 65 }, (_, i) => `c-${i}`) }).ok, false);
  assert.equal(parseOnlineCommand({ type: "resolveDecision", markerSelections: [{ id: "x", amount: 0 }] }).ok, false);
  assert.equal(parseOnlineCommand({ type: "playCard", cardId: "x", ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`junk${i}`, i])) }).ok, false);
});

test("HTTP boundary parses and sanitizes the browser command before applyRulesCommand", () => {
  const route = fs.readFileSync(new URL("../app/api/rooms/[id]/route.ts", import.meta.url), "utf8");
  assert.match(route, /parseOnlineCommand\(body\.command\)/);
  assert.match(route, /applyRulesCommand\(room, role, parsedCommand\.command,/);
  assert.doesNotMatch(route, /applyRulesCommand\(room, role, body\.command,/);
  assert.match(route, /code: parsedCommand\.code/);
});
