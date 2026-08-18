import { AIController } from "./controller";
import type { AIGameState, AIChoiceResult } from "./types";

export interface AIDriverHooks {
  getState: () => AIGameState | null;
  execute: (action: Record<string, unknown>, owner: number) => Promise<boolean>;
  onThinkingChange?: (thinking: boolean, result?: AIChoiceResult) => void;
}

/**
 * Thin browser integration layer. It protects the React game loop from stale
 * async searches: the selected action is executed only if the same player is
 * still active and the public turn/phase signature did not change while MCTS
 * was thinking.
 */
export class BrowserAIDriver {
  readonly controller: AIController;
  private generation = 0;
  private running = false;

  constructor(difficulty: string, private hooks: AIDriverHooks) {
    this.controller = new AIController(difficulty);
  }

  setDifficulty(difficulty: string): void {
    this.controller.setDifficulty(difficulty);
  }

  cancel(): void {
    this.generation += 1;
    this.running = false;
    this.hooks.onThinkingChange?.(false);
  }

  isThinking(): boolean { return this.running; }

  async act(owner: number): Promise<AIChoiceResult | null> {
    if (this.running) return null;
    const initial = this.hooks.getState();
    if (!initial || initial.winner != null) return null;
    const generation = ++this.generation;
    const signature = this.signature(initial, owner);
    this.running = true;
    this.hooks.onThinkingChange?.(true);

    try {
      const result = await this.controller.chooseAction(initial, owner);
      if (generation !== this.generation || !result.action) return result;
      const latest = this.hooks.getState();
      if (!latest || this.signature(latest, owner) !== signature) return result;
      await this.hooks.execute(result.action, owner);
      return result;
    } finally {
      if (generation === this.generation) {
        this.running = false;
        this.hooks.onThinkingChange?.(false);
      }
    }
  }

  private signature(state: AIGameState, owner: number): string {
    return [state.round, state.phase, state.active, state.winner ?? "-", state.players[owner]?.hand?.length ?? 0, state.players[owner]?.energy ?? 0, state.players[owner]?.reserve ?? 0, state.players[owner]?.board?.length ?? 0, state.players[1 - owner]?.board?.length ?? 0].join(":");
  }
}
