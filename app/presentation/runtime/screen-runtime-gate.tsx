"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const MatchUiGuard = dynamic(() => import("../match/match-ui-guard"), { ssr: false });
const MatchRuntimeGate = dynamic(() => import("./match-runtime-gate"), { ssr: false });
const OnlineMatchRuntime = dynamic(() => import("../../application/online/online-match-runtime"), { ssr: false });
const CardArtWarmupRuntime = dynamic(() => import("../cards/card-art-warmup-runtime"), { ssr: false });
const GameGlossaryRuntime = dynamic(() => import("../glossary/game-glossary-runtime"), { ssr: false });
const CardDoubleClickInspectRuntime = dynamic(() => import("../cards/card-double-click-inspect-runtime"), { ssr: false });
const CardPreviewRuntime = dynamic(() => import("../cards/card-preview-runtime"), { ssr: false });
const CollectionSelectedDeckPriorityRuntime = dynamic(
  () => import("../cards/collection-selected-deck-priority-runtime"),
  { ssr: false },
);

type RuntimeScreen = "menu" | "setup" | "decks" | "tutorial" | "game" | "other";

function screenFromApp(app: Element | null): RuntimeScreen {
  if (!app) return "other";
  if (app.classList.contains("screen-game")) return "game";
  if (app.classList.contains("screen-decks")) return "decks";
  if (app.classList.contains("screen-setup")) return "setup";
  if (app.classList.contains("screen-tutorial")) return "tutorial";
  if (app.classList.contains("screen-menu")) return "menu";
  return "other";
}

const carriesCards = (screen: RuntimeScreen) => ["setup", "decks", "tutorial", "game"].includes(screen);

/**
 * One small observer owns screen detection for DOM-oriented runtimes. Card
 * preview/glossary/warmup code does not exist on the landing screen, while
 * match-only observers and CSS remain absent until the actual board mounts.
 */
export default function ScreenRuntimeGate() {
  const [screen, setScreen] = useState<RuntimeScreen>("other");
  const appRef = useRef<Element | null>(null);

  useEffect(() => {
    let frame = 0;
    let disposed = false;
    const appObserver = new MutationObserver(() => scheduleSync());

    const bindApp = () => {
      const app = document.querySelector("main.hh-app");
      if (app === appRef.current) return app;
      appObserver.disconnect();
      appRef.current = app;
      if (app) appObserver.observe(app, { attributes: true, attributeFilter: ["class"] });
      return app;
    };

    const sync = () => {
      frame = 0;
      if (disposed) return;
      const next = screenFromApp(bindApp());
      setScreen((current) => current === next ? current : next);
    };

    const scheduleSync = () => {
      if (frame || disposed) return;
      frame = requestAnimationFrame(sync);
    };

    const rootObserver = new MutationObserver(scheduleSync);
    rootObserver.observe(document.body, { childList: true });
    sync();

    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      rootObserver.disconnect();
      appObserver.disconnect();
      appRef.current = null;
    };
  }, []);

  const cardRuntimes = carriesCards(screen) ? <>
    <CardArtWarmupRuntime />
    <GameGlossaryRuntime />
    <CardDoubleClickInspectRuntime />
    <CardPreviewRuntime />
  </> : null;

  if (screen === "game") {
    return <>
      {cardRuntimes}
      <MatchUiGuard />
      <MatchRuntimeGate />
      <OnlineMatchRuntime />
    </>;
  }
  if (screen === "decks") return <>{cardRuntimes}<CollectionSelectedDeckPriorityRuntime /></>;
  return cardRuntimes;
}
