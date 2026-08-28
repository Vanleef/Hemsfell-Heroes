/* Browser instrumentation facade. The authoritative rules implementation lives in
 * engine-core.mjs and stays side-effect free. Presentation is explicitly opt-in:
 * legality probes, combat queries and AI simulations also execute cloned states in
 * the browser and must never be mistaken for completed match transitions. */
import { executeCommand as executeCore } from "./engine-core.mjs";
export * from "./engine-core.mjs";

const RULES_RESOLVED_EVENT = "hemsfell:rules-command-resolved";

const browserClone = (value) => {
  try { return structuredClone(value); }
  catch { return value; }
};
const publishBrowserResolution = (detail) => {
  /* Dispatch before React commits the returned state. The presentation runtime
     captures the real pre-action DOM and raises its busy barrier synchronously,
     so result dialogs cannot flash ahead of the card animation. */
  window.dispatchEvent(new CustomEvent(RULES_RESOLVED_EVENT, { detail }));
};

export function executeCommand(inputState, command, options = {}) {
  const shouldPresent = options?.presentation === true
    && typeof window !== "undefined"
    && typeof CustomEvent !== "undefined";
  const before = shouldPresent ? browserClone(inputState) : null;
  const result = executeCore(inputState, command, options);
  if (shouldPresent && before && result?.state && command?.type) {
    publishBrowserResolution({
      before,
      after: browserClone(result.state),
      command: browserClone(command),
      trace: browserClone(result.trace || []),
    });
  }
  return result;
}
