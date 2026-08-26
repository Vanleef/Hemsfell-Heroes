"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  flushQueuedPriorityControl,
  priorityWindowKey,
  requestPriorityControlChange,
  shouldAutoPassPriorityWindow,
  shouldShowPriorityWindow,
} from "./priority-control-policy.mjs";

export type PriorityControlMode = "assisted" | "full-control";

type PendingResponseLike = {
  responder: 0 | 1;
  actor: 0 | 1;
  action: string;
  deadline?: number;
  passes?: number;
} | null;

type UsePriorityControlArgs = {
  interactionActive: boolean;
  pendingResponse: PendingResponseLike;
  hasUsableResponse: boolean;
  getCurrentPending: () => PendingResponseLike;
  onAutoPass: () => void | Promise<unknown>;
  owner?: 0 | 1;
  autoPassDelayMs?: number;
};

export function usePriorityControl({
  interactionActive,
  pendingResponse,
  hasUsableResponse,
  getCurrentPending,
  onAutoPass,
  owner = 0,
  autoPassDelayMs = 80,
}: UsePriorityControlArgs) {
  const [mode, setMode] = useState<PriorityControlMode>("assisted");
  const [queuedMode, setQueuedMode] = useState<PriorityControlMode | null>(null);
  const getCurrentPendingRef = useRef(getCurrentPending);
  const onAutoPassRef = useRef(onAutoPass);

  useEffect(() => {
    getCurrentPendingRef.current = getCurrentPending;
    onAutoPassRef.current = onAutoPass;
  }, [getCurrentPending, onAutoPass]);

  useEffect(() => {
    const next = flushQueuedPriorityControl({ mode, queuedMode, interactionActive });
    if (next.mode !== mode) setMode(next.mode as PriorityControlMode);
    if (next.queuedMode !== queuedMode) setQueuedMode(next.queuedMode as PriorityControlMode | null);
  }, [interactionActive, mode, queuedMode]);

  const toggle = useCallback(() => {
    const next = requestPriorityControlChange({ mode, queuedMode, interactionActive });
    setMode(next.mode as PriorityControlMode);
    setQueuedMode(next.queuedMode as PriorityControlMode | null);
  }, [interactionActive, mode, queuedMode]);

  const pendingKey = priorityWindowKey(pendingResponse);
  useEffect(() => {
    if (!shouldAutoPassPriorityWindow({ pending: pendingResponse, owner, mode, hasUsableResponse })) return;
    const key = pendingKey;
    if (!key) return;
    const timer = window.setTimeout(() => {
      if (priorityWindowKey(getCurrentPendingRef.current()) !== key) return;
      void onAutoPassRef.current();
    }, autoPassDelayMs);
    return () => window.clearTimeout(timer);
  }, [autoPassDelayMs, hasUsableResponse, mode, owner, pendingKey, pendingResponse]);

  return {
    mode,
    displayMode: queuedMode ?? mode,
    changeQueued: queuedMode !== null,
    toggle,
    showWindow: shouldShowPriorityWindow({
      pending: pendingResponse,
      owner,
      mode,
      hasUsableResponse,
    }),
  };
}
