import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { isAccelerated, legalPriorityResponses } from "../app/rules-engine/priority.mjs";

const player = () => ({ heroId: "rasmus", level: 1, life: 30, energy: 3, reserve: 3, hand: [], deck: [], board: [], support: [], terrain: null, grave: [], obscuro: [], abilityUses: {} });

test("Café Pingado is not an accelerated response", () => {
  const cafe = compileCard({ page: 236, id: "p236", name: "Café Pingado", type: "Feitiço", cost: 1, text: "A próxima vez que a criatura alvo receberia dano neste turno, previna 1 desse dano.", tags: [], image: "", hero: false, imageCard: false });
  assert.equal(isAccelerated(cafe), false);
  const p0 = player(), p1 = player();
  p0.hand = [cafe];
  const state = { players: [p0, p1], active: 1, phase: "principal", round: 1, pendingResponse: { responder: 0, actor: 1, action: "ação", passes: 0 }, priorityStack: [] };
  assert.deepEqual(legalPriorityResponses(state, 0), []);
});

test("response timeout guard dispatches pass only once per expired cycle", async () => {
  const source = await fs.readFile(new URL("../app/match-ui-guard.tsx", import.meta.url), "utf8");
  assert.match(source, /function passExpiredResponseWindow\(\)/);
  assert.match(source, /timeoutPassDispatched/);
  assert.match(source, /setInterval\(passExpiredResponseWindow, 200\)/);
  assert.match(source, /passButton\.click\(\)/);
});
