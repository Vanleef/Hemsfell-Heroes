export type PriorityControlMode = "assisted" | "full-control";
export type PriorityPending = { actor: 0 | 1; responder: 0 | 1; action: string; passes?: number; deadline?: number } | null;
export function nextPriorityControlMode(mode: PriorityControlMode): PriorityControlMode;
export function priorityWindowKey(pending: PriorityPending): string | null;
export function requestPriorityControlChange(input: { mode: PriorityControlMode; queuedMode?: PriorityControlMode | null; interactionActive: boolean }): { mode: PriorityControlMode; queuedMode: PriorityControlMode | null };
export function flushQueuedPriorityControl(input: { mode: PriorityControlMode; queuedMode?: PriorityControlMode | null; interactionActive: boolean }): { mode: PriorityControlMode; queuedMode: PriorityControlMode | null };
export function shouldShowPriorityWindow(input: { pending: PriorityPending; owner?: 0 | 1; mode: PriorityControlMode; hasUsableResponse: boolean }): boolean;
export function shouldAutoPassPriorityWindow(input: { pending: PriorityPending; owner?: 0 | 1; mode: PriorityControlMode; hasUsableResponse: boolean }): boolean;
