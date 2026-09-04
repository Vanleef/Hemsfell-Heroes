"use client";

import { useEffect } from "react";
import { preloadRemoteCardCatalog } from "./remote-card-art";

/**
 * The menu is the first screen and already contains official card art. Starting
 * the PDF worker/metadata fetch at app mount lets menu, collection and setup
 * share the same catalogue promise instead of waiting for a later interaction.
 */
export default function CardArtWarmupRuntime() {
  useEffect(() => {
    void preloadRemoteCardCatalog().catch(() => undefined);
  }, []);
  return null;
}
