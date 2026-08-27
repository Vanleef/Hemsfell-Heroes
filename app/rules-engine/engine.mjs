/* Browser instrumentation facade. The authoritative rules implementation lives in
 * engine-core.mjs and stays side-effect free; this module only mirrors completed
 * top-level client resolutions into a neutral event consumed by presentation. */
import { executeCommand as executeCore } from "./engine-core.mjs";
export * from "./engine-core.mjs";

const RULES_RESOLVED_EVENT = "hemsfell:rules-command-resolved";
let flushScheduled = false;
const pending = new Map();

const browserClone = (value) => {
  try { return structuredClone(value); }
  catch { return value; }
};
const transitionKey = (before, after, command) => JSON.stringify({
  type: command?.type,
  owner: command?.owner,
  cardId: command?.cardId,
  sourceId: command?.sourceId,
  abilityId: command?.abilityId,
  attackerId: command?.attackerId,
  defenderId: command?.defenderId,
  beforeRound: before?.round,
  beforeEvents: before?.events,
  beforeLog: before?.log?.[0]?.id,
  afterRound: after?.round,
  afterEvents: after?.events,
  afterLog: after?.log?.[0]?.id,
  beforeHands: before?.players?.map?.((entry) => entry?.hand?.length || 0),
  afterHands: after?.players?.map?.((entry) => entry?.hand?.length || 0),
});
const scheduleBrowserResolution = (detail) => {
  const key = transitionKey(detail.before, detail.after, detail.command);
  pending.set(key, detail);
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    const batch = [...pending.values()];
    pending.clear();
    for (const item of batch) window.dispatchEvent(new CustomEvent(RULES_RESOLVED_EVENT, { detail: item }));
  });
};

export function executeCommand(inputState, command, options = {}) {
  const inBrowser = typeof window !== "undefined" && typeof CustomEvent !== "undefined";
  const before = inBrowser ? browserClone(inputState) : null;
  const result = executeCore(inputState, command, options);
  if (inBrowser && before && result?.state && command?.type) {
    scheduleBrowserResolution({
      before,
      after: browserClone(result.state),
      command: browserClone(command),
      trace: browserClone(result.trace || []),
    });
  }
  return result;
}
