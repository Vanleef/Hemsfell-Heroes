import type { AIAction, AIGameState, CalibrationCategory, CalibrationScenario, EngineAdapter } from "./types";
import { stableActionKey } from "./telemetry";

const HEROES = ["goblin", "gimble", "tifon", "saymon", "uruk", "quarion"];
const dummyDeck = (prefix: string, count = 24) => Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`, name: `${prefix} ${index}`, type: index % 3 === 0 ? "Feitiço" : "Criatura", cost: 1 + index % 6, atk: 1 + index % 4, hp: 1 + (index + 1) % 5, text: index % 5 === 0 ? "Compre 1 carta." : "" }));
const unit = (id: string, atk: number, hp: number, extras: Record<string, unknown> = {}) => ({ id, uid: id, name: id, type: "Criatura", cost: Math.max(1, Math.round((atk + hp) / 3)), atk, hp, damage: 0, summoning: false, exhausted: false, ...extras });
const card = (id: string, cost: number, text: string, extras: Record<string, unknown> = {}) => ({ id, name: id, type: "Feitiço", cost, text, tags: [], ...extras });

const baseState = (index: number, overrides: Partial<AIGameState> = {}): AIGameState => ({
  active: 0,
  phase: "principal",
  round: 5 + index,
  winner: null,
  players: [
    { heroId: HEROES[index % HEROES.length], level: 2, life: 22, maxLife: 30, energy: 6, maxEnergy: 6, reserve: 2, hand: [], deck: dummyDeck(`own-${index}`), board: [], support: [], terrain: null },
    { heroId: HEROES[(index + 2) % HEROES.length], level: 2, life: 22, maxLife: 30, energy: 5, maxEnergy: 6, reserve: 1, hand: [], deck: dummyDeck(`foe-${index}`), board: [], support: [], terrain: null },
  ],
  ...overrides,
});

const terminal = (state: AIGameState, mutate: (copy: AIGameState) => void): AIGameState => {
  const copy = structuredClone(state);
  mutate(copy);
  copy.__calibrationTerminal = true;
  return copy;
};

const scenario = (
  id: string,
  category: CalibrationCategory,
  description: string,
  state: AIGameState,
  candidates: Array<{ action: AIAction; next: AIGameState; acceptable?: boolean }>,
): CalibrationScenario => ({
  id,
  category,
  description,
  state,
  owner: 0,
  candidateActions: candidates.map((entry) => entry.action),
  acceptableActionKeys: candidates.filter((entry) => entry.acceptable).map((entry) => stableActionKey(entry.action)),
  successorByActionKey: Object.fromEntries(candidates.map((entry) => [stableActionKey(entry.action), entry.next])),
});

const lethalScenarios = (): CalibrationScenario[] => Array.from({ length: 6 }, (_, i) => {
  const state = baseState(i);
  state.players[1].life = 4 + i;
  state.players[0].board = [unit(`finisher-${i}`, 6 + i, 4)];
  const attack = { type: "attack", owner: 0, attackerId: `finisher-${i}` };
  const develop = { type: "playCard", owner: 0, cardId: `setup-${i}` };
  return scenario(`lethal-${i + 1}`, "lethal", "Prefer guaranteed lethal over extra development.", state, [
    { action: attack, acceptable: true, next: terminal(state, (copy) => { copy.players[1].life = 0; copy.winner = 0; }) },
    { action: develop, next: terminal(state, (copy) => { copy.players[0].board.push(unit(`extra-${i}`, 3, 3, { summoning: true })); copy.players[0].energy = 2; }) },
  ]);
});

const tradeScenarios = (): CalibrationScenario[] => Array.from({ length: 6 }, (_, i) => {
  const state = baseState(10 + i);
  state.phase = "combate";
  state.players[0].board = [unit(`attacker-${i}`, 4 + i % 2, 5)];
  state.players[1].board = [unit(`threat-${i}`, 5 + i, 2 + i % 2)];
  const trade = { type: "attack", owner: 0, attackerId: `attacker-${i}`, defenderId: `threat-${i}` };
  const face = { type: "attack", owner: 0, attackerId: `attacker-${i}` };
  return scenario(`trade-${i + 1}`, "trade", "Take the favorable threat-removing trade instead of low-value face damage.", state, [
    { action: trade, acceptable: true, next: terminal(state, (copy) => { copy.players[1].board = []; copy.players[0].board[0].damage = 2; }) },
    { action: face, next: terminal(state, (copy) => { copy.players[1].life -= 4; copy.players[0].board = []; }) },
  ]);
});

const overextensionScenarios = (): CalibrationScenario[] => Array.from({ length: 6 }, (_, i) => {
  const state = baseState(20 + i);
  state.players[0].board = [unit(`a-${i}`, 3, 3), unit(`b-${i}`, 4, 4), unit(`c-${i}`, 2, 5), unit(`d-${i}`, 3, 2)];
  state.players[1].hand = [card(`sweep-${i}`, 5, "Cause 4 de dano a todas as criaturas.")];
  const extend = { type: "playCard", owner: 0, cardId: `fifth-${i}` };
  const pass = { type: "advancePhase", owner: 0 };
  return scenario(`overextension-${i + 1}`, "overextension", "Do not add a marginal fifth body into a represented sweeper.", state, [
    { action: extend, next: terminal(state, (copy) => { copy.players[0].board.push(unit(`fifth-${i}`, 2, 2)); copy.players[0].energy = 3; }) },
    { action: pass, acceptable: true, next: terminal(state, (copy) => { copy.phase = "combate"; }) },
  ]);
});

const holdResponseScenarios = (): CalibrationScenario[] => Array.from({ length: 6 }, (_, i) => {
  const state = baseState(30 + i, { pendingResponse: { responder: 0 } });
  state.players[0].hand = [card(`answer-${i}`, 2, "Acelerado. Cause 2 de dano a uma criatura.")];
  state.players[1].board = [unit(`minor-${i}`, 1 + i % 2, 2)];
  const answer = { type: "playCard", owner: 0, cardId: `answer-${i}`, targetIds: [`minor-${i}`] };
  const hold = { type: "passPriority", owner: 0 };
  return scenario(`hold-response-${i + 1}`, "hold-response", "Preserve interaction against a low-pressure target instead of spending it immediately.", state, [
    { action: answer, next: terminal(state, (copy) => { copy.players[0].hand = []; copy.players[0].reserve = 0; copy.players[1].board = []; copy.pendingResponse = null; }) },
    { action: hold, acceptable: true, next: terminal(state, (copy) => { copy.pendingResponse = null; }) },
  ]);
});

const developmentScenarios = (): CalibrationScenario[] => Array.from({ length: 6 }, (_, i) => {
  const state = baseState(40 + i);
  state.players[0].hand = [unit(`curve-${i}`, 3 + i % 2, 4, { cost: 3, summoning: true })];
  const develop = { type: "playCard", owner: 0, cardId: `curve-${i}` };
  const pass = { type: "advancePhase", owner: 0 };
  return scenario(`development-${i + 1}`, "development", "Develop a solid on-curve body on an empty board.", state, [
    { action: develop, acceptable: true, next: terminal(state, (copy) => { copy.players[0].hand = []; copy.players[0].energy = 3; copy.players[0].board = [unit(`curve-${i}`, 3 + i % 2, 4, { summoning: true })]; }) },
    { action: pass, next: terminal(state, (copy) => { copy.phase = "combate"; }) },
  ]);
});

const lowLifeScenarios = (): CalibrationScenario[] => Array.from({ length: 6 }, (_, i) => {
  const state = baseState(50 + i);
  state.players[0].life = 3 + i % 3;
  state.players[1].board = [unit(`pressure-${i}`, 5, 4)];
  state.players[0].hand = [card(`stabilize-${i}`, 3, "Cure 6 de vida. Previna dano."), card(`greed-${i}`, 3, "Compre 2 cartas.")];
  const stabilize = { type: "playCard", owner: 0, cardId: `stabilize-${i}` };
  const greed = { type: "playCard", owner: 0, cardId: `greed-${i}` };
  return scenario(`low-life-${i + 1}`, "low-life", "Stabilize at low life before taking greedy value.", state, [
    { action: stabilize, acceptable: true, next: terminal(state, (copy) => { copy.players[0].life += 6; copy.players[0].energy = 3; copy.players[0].hand = [copy.players[0].hand[1]]; }) },
    { action: greed, next: terminal(state, (copy) => { copy.players[0].energy = 3; copy.players[0].hand.push(card(`draw-a-${i}`, 4, ""), card(`draw-b-${i}`, 5, "")); }) },
  ]);
});

const resourceScenarios = (): CalibrationScenario[] => Array.from({ length: 6 }, (_, i) => {
  const state = baseState(60 + i);
  state.players[0].energy = 7;
  state.players[0].reserve = 2;
  state.players[0].maxEnergy = 7;
  const spend = { type: "playCard", owner: 0, cardId: `efficient-${i}` };
  const pass = { type: "advancePhase", owner: 0 };
  return scenario(`resources-${i + 1}`, "resources", "Use productive energy before ending a phase that would waste it.", state, [
    { action: spend, acceptable: true, next: terminal(state, (copy) => { copy.players[0].energy = 3; copy.players[0].board.push(unit(`efficient-${i}`, 4, 5, { summoning: true })); }) },
    { action: pass, next: terminal(state, (copy) => { copy.phase = "fim"; copy.players[0].energy = 7; }) },
  ]);
});

const handCapScenarios = (): CalibrationScenario[] => Array.from({ length: 6 }, (_, i) => {
  const state = baseState(70 + i);
  state.players[0].hand = Array.from({ length: 10 }, (_, index) => card(`hand-${i}-${index}`, 1 + index % 4, index === 9 ? "Compre 2 cartas." : ""));
  const dump = { type: "playCard", owner: 0, cardId: `hand-${i}-0` };
  const draw = { type: "playCard", owner: 0, cardId: `hand-${i}-9` };
  return scenario(`hand-cap-${i + 1}`, "hand-cap", "Create hand space instead of drawing into the hand cap.", state, [
    { action: dump, acceptable: true, next: terminal(state, (copy) => { copy.players[0].hand = copy.players[0].hand.slice(1); copy.players[0].energy -= 1; }) },
    { action: draw, next: terminal(state, (copy) => { copy.players[0].hand.push(card(`overflow-${i}-a`, 2, ""), card(`overflow-${i}-b`, 2, "")); copy.players[0].energy -= 2; }) },
  ]);
});

export const CALIBRATION_CORPUS: CalibrationScenario[] = [
  ...lethalScenarios(),
  ...tradeScenarios(),
  ...overextensionScenarios(),
  ...holdResponseScenarios(),
  ...developmentScenarios(),
  ...lowLifeScenarios(),
  ...resourceScenarios(),
  ...handCapScenarios(),
];

export const calibrationAdapter = (scenario: CalibrationScenario): EngineAdapter => ({
  generateLegalActions: (state) => state.__calibrationTerminal ? [] : scenario.candidateActions.map((action) => ({ ...action })),
  applyAction: (_state, action) => {
    const next = scenario.successorByActionKey[stableActionKey(action)];
    if (!next) throw new Error(`Unknown calibration action for ${scenario.id}: ${stableActionKey(action)}`);
    return structuredClone(next);
  },
  cloneState: (state) => structuredClone(state),
});

if (CALIBRATION_CORPUS.length !== 48) throw new Error(`AI calibration corpus must contain 48 scenarios, got ${CALIBRATION_CORPUS.length}`);
