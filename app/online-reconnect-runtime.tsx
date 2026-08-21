"use client";

import { useEffect, useRef } from "react";
import { loadOnlineSession } from "./online-session.mjs";

function activeRoomSession() {
  const roomId = new URLSearchParams(window.location.search).get("room");
  return loadOnlineSession(localStorage, roomId);
}

/**
 * The match page sends `disconnect` on pagehide. A normal remount already sends
 * `resume`, but browser back/forward cache can restore the same React tree
 * without remounting it. This global bridge resumes idempotently on every
 * browser signal that means the player is actually back. The authenticated GET
 * is also a server heartbeat now, so even if an explicit resume POST races with
 * polling, the next heartbeat clears stale disconnected state for both clients.
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
        const path = `/api/rooms/${encodeURIComponent(session.roomId)}`;
        const response = await fetch(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "resume", token: session.token }),
          cache: "no-store",
        });
        if (!response.ok) {
          await fetch(path, { cache: "no-store", headers: { authorization: `Bearer ${session.token}` } });
        }
      } catch {
        // The normal authenticated room poll is itself a heartbeat and retries.
      } finally {
        inFlight.current = false;
      }
    };

    const onPageShow = () => { void resume(); };
    const onOnline = () => { void resume(); };
    const onFocus = () => { void resume(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void resume(); };

    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    void resume();

    return () => {
      disposed = true;
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
