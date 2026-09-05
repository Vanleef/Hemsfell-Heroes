"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const MobileTouchInputRuntime = dynamic(() => import("./mobile-touch-input-runtime"), { ssr: false });
const COARSE_POINTER_QUERY = "(any-pointer: coarse)";

/**
 * Keep the touch gesture controller completely out of desktop match runtime.
 * Touch-enabled laptops still opt in through any-pointer, while phones/tablets
 * load the heavier drag/inspection bridge immediately on the client.
 */
export default function MobileMatchRuntimeGate() {
  const [active, setActive] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(COARSE_POINTER_QUERY).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(COARSE_POINTER_QUERY);
    const sync = () => setActive((current) => current === media.matches ? current : media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  return active ? <MobileTouchInputRuntime /> : null;
}
