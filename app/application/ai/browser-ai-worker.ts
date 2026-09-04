import type { AIChoiceResult, AIGameState, AIObservation } from "../../rules-engine/ai-system/types";

type WorkerMessage =
  | { kind: "choose"; state: AIGameState; owner: number; difficulty: string }
  | { kind: "observe"; owner: number; difficulty: string; observation: AIObservation }
  | { kind: "reset"; owner?: number };
type WorkerRequest = WorkerMessage & { id: number };

type WorkerResponse = { id: number; result?: AIChoiceResult | null; error?: string };
type Pending = { resolve: (value: AIChoiceResult) => void; reject: (reason?: unknown) => void };

export type BrowserAIWorkerBridge = {
  chooseAction: (state: AIGameState, owner: number, difficulty: string) => Promise<AIChoiceResult>;
  observe: (owner: number, difficulty: string, observation: AIObservation) => void;
  reset: (owner?: number) => void;
};

declare global {
  var __hemsfellAIWorkerBridge: BrowserAIWorkerBridge | undefined;
}

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, Pending>();

const rejectPending = (reason: unknown) => {
  pending.forEach(({ reject }) => reject(reason));
  pending.clear();
};

const getWorker = () => {
  if (worker) return worker;
  worker = new Worker(new URL("./search.worker.ts", import.meta.url), { type: "module", name: "hemsfell-ai" });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.error || !event.data.result) request.reject(new Error(event.data.error || "AI worker returned no result"));
    else request.resolve(event.data.result);
  };
  worker.onerror = (event) => {
    rejectPending(new Error(event.message || "AI worker failed"));
    worker?.terminate();
    worker = null;
  };
  return worker;
};

const post = (message: WorkerMessage): Promise<AIChoiceResult> => {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...message, id } as WorkerRequest);
  });
};

const notify = (message: WorkerMessage) => {
  const id = ++requestId;
  try { getWorker().postMessage({ ...message, id } as WorkerRequest); }
  catch { worker = null; }
};

if (typeof window !== "undefined" && typeof Worker !== "undefined") {
  globalThis.__hemsfellAIWorkerBridge = {
    chooseAction: async (state, owner, difficulty) => {
      window.dispatchEvent(new CustomEvent("hemsfell:ai-thinking", { detail: { thinking: true, difficulty, context: "worker" } }));
      try {
        const result = await post({ kind: "choose", state, owner, difficulty });
        window.dispatchEvent(new CustomEvent("hemsfell:ai-debug", { detail: { ...result, stats: result.stats, worker: true } }));
        return result;
      } finally {
        window.dispatchEvent(new CustomEvent("hemsfell:ai-thinking", { detail: { thinking: false, difficulty, context: "worker" } }));
      }
    },
    observe: (owner, difficulty, observation) => notify({ kind: "observe", owner, difficulty, observation }),
    reset: () => {
      worker?.terminate();
      worker = null;
      rejectPending(new DOMException("AI search cancelled", "AbortError"));
    },
  };
}

export const browserAIWorkerInstalled = typeof window !== "undefined" && !!globalThis.__hemsfellAIWorkerBridge;
