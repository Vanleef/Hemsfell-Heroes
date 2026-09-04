/// <reference lib="webworker" />

import { AIController } from "../../rules-engine/ai-system/controller";
import type { AIGameState, AIObservation, AIPlayerLike } from "../../rules-engine/ai-system/types";

type WorkerRequest =
  | { id: number; kind: "choose"; state: AIGameState; owner: number; difficulty: string }
  | { id: number; kind: "observe"; owner: number; difficulty: string; observation: AIObservation }
  | { id: number; kind: "reset"; owner?: number };

const controllers = new Map<number, AIController>();
const lastObservedState = new Map<number, AIGameState>();
const cardId = (card: Record<string, unknown> | null | undefined) => String(card?.uid ?? card?.id ?? "");
const publicCards = (player: AIPlayerLike) => [
  ...(player?.board || []),
  ...(player?.support || []),
  ...(player?.terrain ? [player.terrain] : []),
  ...(player?.grave || []),
  ...(player?.obscuro || []),
];

const controllerFor = (owner: number, difficulty: string) => {
  let controller = controllers.get(owner);
  if (!controller) {
    controller = new AIController(difficulty);
    controllers.set(owner, controller);
  }
  controller.setDifficulty(difficulty);
  return controller;
};

const observePublicDelta = (controller: AIController, state: AIGameState, owner: number) => {
  const previous = lastObservedState.get(owner);
  if (!previous) {
    lastObservedState.set(owner, structuredClone(state));
    return;
  }
  const opponent = 1 - owner;
  const before = previous.players[opponent];
  const after = state.players[opponent];
  if (!before || !after) return;

  const previousPublicIds = new Set(publicCards(before).map(cardId).filter(Boolean));
  const previousHandIds = new Set((before.hand || []).map(cardId).filter(Boolean));
  const newlyPublic = publicCards(after).filter((card) => {
    const id = cardId(card);
    return id && !previousPublicIds.has(id);
  });
  const fromHand = newlyPublic.filter((card) => previousHandIds.has(cardId(card)));
  for (const card of fromHand) controller.observe({ type: "play", player: opponent, cardId: cardId(card), card, round: state.round });

  const deckDelta = Math.max(0, Number(before.deck?.length || 0) - Number(after.deck?.length || 0));
  const handDelta = Number(after.hand?.length || 0) - Number(before.hand?.length || 0);
  const inferredDraws = Math.min(deckDelta, Math.max(0, handDelta + fromHand.length));
  if (inferredDraws > 0) controller.observe({ type: "draw", player: opponent, count: inferredDraws, round: state.round });
  lastObservedState.set(owner, structuredClone(state));
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.kind === "reset") {
      if (request.owner == null) {
        controllers.clear();
        lastObservedState.clear();
      } else {
        controllers.delete(request.owner);
        lastObservedState.delete(request.owner);
      }
      self.postMessage({ id: request.id, result: null });
      return;
    }
    if (request.kind === "observe") {
      controllerFor(request.owner, request.difficulty).observe(request.observation);
      self.postMessage({ id: request.id, result: null });
      return;
    }

    const controller = controllerFor(request.owner, request.difficulty);
    observePublicDelta(controller, request.state, request.owner);
    const result = await controller.chooseAction(request.state, request.owner);
    lastObservedState.set(request.owner, structuredClone(request.state));
    self.postMessage({ id: request.id, result });
  } catch (error) {
    self.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
