"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import MatchLoadingRuntime from "./match-loading-runtime";

const MatchUiRuntime = dynamic(() => import("../match/match-ui-runtime"), { ssr: false });
const PresentationEventBridge = dynamic(() => import("./presentation-event-bridge"), { ssr: false });
const PresentationInteractionRuntime = dynamic(() => import("./presentation-interaction-runtime"), { ssr: false });
const PresentationLivenessRuntime = dynamic(() => import("./presentation-liveness-runtime"), { ssr: false });
const PresentationMemoryRuntime = dynamic(() => import("./presentation-memory-runtime"), { ssr: false });
const GamePresentationRuntime = dynamic(() => import("./game-presentation-runtime"), { ssr: false });
const HeroPanelExpandRuntime = dynamic(() => import("./hero-panel-expand-runtime"), { ssr: false });
const HeroAbilityDetailRuntime = dynamic(() => import("./hero-ability-detail-runtime"), { ssr: false });
const HeroAbilityRailRuntime = dynamic(() => import("./hero-ability-rail-runtime"), { ssr: false });
const StatusOverflowRuntime = dynamic(() => import("./status-overflow-runtime"), { ssr: false });
const MatchRequestedUiRuntime = dynamic(() => import("./match-requested-ui-runtime"), { ssr: false });
const HandAiUiRuntime = dynamic(() => import("./hand-ai-ui-runtime"), { ssr: false });
const CardMarkerCounterRuntime = dynamic(() => import("./card-marker-counter-runtime"), { ssr: false });
const TerrainFieldAnchorRuntime = dynamic(() => import("./terrain-field-anchor-runtime"), { ssr: false });
const EvolutionTooltipPortalRuntime = dynamic(() => import("./evolution-tooltip-portal-runtime"), { ssr: false });
const MatchFeedbackRuntime = dynamic(() => import("./match-feedback-runtime"), { ssr: false });
const PhaseActionRuntime = dynamic(() => import("./phase-action-runtime"), { ssr: false });
const MobileTouchInputRuntime = dynamic(() => import("./mobile-touch-input-runtime"), { ssr: false });

/** Load match-only DOM runtimes after the board exists, not on menus/collection/tutorial. */
export default function MatchRuntimeGate() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => {
      const next = document.body.dataset.matchActive === "true" || !!document.querySelector(".game-stage");
      setActive((current) => current === next ? current : next);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-match-active"] });
    sync();
    return () => observer.disconnect();
  }, []);

  if (!active) return null;
  return <>
    <MatchLoadingRuntime />
    <MatchUiRuntime />
    <PresentationEventBridge />
    <PresentationInteractionRuntime />
    <GamePresentationRuntime />
    <PresentationLivenessRuntime />
    <PresentationMemoryRuntime />
    <HeroPanelExpandRuntime />
    <HeroAbilityDetailRuntime />
    <HeroAbilityRailRuntime />
    <StatusOverflowRuntime />
    <MatchRequestedUiRuntime />
    <HandAiUiRuntime />
    <CardMarkerCounterRuntime />
    <TerrainFieldAnchorRuntime />
    <EvolutionTooltipPortalRuntime />
    <MatchFeedbackRuntime />
    <PhaseActionRuntime />
    <MobileTouchInputRuntime />
  </>;
}
