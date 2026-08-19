"use client";

import { useEffect, useRef } from "react";

type StoredSession = { token?: unknown };
const SESSION_PREFIX = "hemsfell-room-";

function activeRoomSession() {
  const roomId = new URLSearchParams(window.location.search).get("room");
  if (!roomId) return null;
  try {
    const stored = JSON.parse(localStorage.getItem(`${SESSION_PREFIX}${roomId}`) || "null") as StoredSession | null;
    if (!stored || typeof stored.token !== "string" || !stored.token) return null;
    return { roomId, token: stored.token };
  } catch {
    return null;
  }
}

/**
 * The match page sends `disconnect` on pagehide. A normal remount already sends
 * `resume`, but browser back/forward cache can restore the same React tree
 * without remounting it. This tiny global bridge makes resume idempotent across
 * bfcache restoration and network recovery so server clocks are unpaused before
 * the next gameplay command is accepted.
 */
export default function OnlineReconnectRuntime() {
  const inFlight = useRef(false);

  useEffect(() => {
    let disposed = false;
    const resume = async () => {
      if (disposed || inFlight.current || document.visibilityState === "hidden") return;
      const session = activeRoomSession();
      if (!session) return;
      inFlight.current = true;
      try {
        await fetch(`/api/rooms/${encodeURIComponent(session.roomId)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "resume", token: session.token }),
          cache: "no-store",
        });
      } catch {
        // The normal room poll will keep retrying; never create a second queue.
      } finally {
        inFlight.current = false;
      }
    };

    const onPageShow = () => { void resume(); };
    const onOnline = () => { void resume(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void resume(); };

    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
