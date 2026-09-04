"use client";

import { useEffect } from "react";

const ASSET_CONTEXT_CHANGE_EVENT = "hemsfell:asset-context-change";

/**
 * Page-level inspectors live above the current screen and therefore can keep a
 * high-resolution RemoteCardArt mounted after navigation. Close those transient
 * surfaces at the same hard boundary used by the art cache policy.
 */
export default function AssetContextUiCleanupRuntime() {
  useEffect(() => {
    const cleanupTransientCardUi = () => {
      document.querySelectorAll(".card-inspection-hold-progress").forEach((node) => node.remove());
      const inspector = document.querySelector<HTMLElement>(".overlay.inspector.card-focus-layer");
      if (inspector) inspector.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    };

    window.addEventListener(ASSET_CONTEXT_CHANGE_EVENT, cleanupTransientCardUi);
    return () => window.removeEventListener(ASSET_CONTEXT_CHANGE_EVENT, cleanupTransientCardUi);
  }, []);

  return null;
}
