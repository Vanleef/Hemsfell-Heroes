"use client";

import dynamic from "next/dynamic";
import "../styles/match-runtime-bundle.css";

const MatchLoadingRuntime = dynamic(() => import("./match-loading-runtime"), { ssr: false });
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
const TerrainFieldAnchorRuntime = dynamic(() => import("./terrain-field-anchor-runtime"), { ssr: false });
const EvolutionTooltipPortalRuntime = dynamic(() => import("./evolution-tooltip-portal-runtime"), { ssr: false });
const MatchFeedbackRuntime = dynamic(() => import("./match-feedback-runtime"), { ssr: false });
const PhaseActionRuntime = dynamic(() => import("./phase-action-runtime"), { ssr: false });
const MobileMatchRuntimeGate = dynamic(() => import("./mobile-match-runtime-gate"), { ssr: false });
const MatchPerformanceRuntime = dynamic(() => import("./match-performance-runtime"), { ssr: false });

/**
 * ScreenRuntimeGate mounts this bundle only while the match screen exists.
 * Keeping this component observer-free avoids a second global match detector
 * while retaining per-feature code splitting inside the match chunk.
 */
export default function MatchRuntimeGate() {
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
    <TerrainFieldAnchorRuntime />
    <EvolutionTooltipPortalRuntime />
    <MatchFeedbackRuntime />
    <PhaseActionRuntime />
    <MobileMatchRuntimeGate />
    <MatchPerformanceRuntime />
  </>;
}
