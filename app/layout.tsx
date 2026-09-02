import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./presentation/styles/base/brand.css";
import "./presentation/styles/match-ui.css";
import "./presentation/styles/online-match-runtime.css";
import "./presentation/styles/game-presentation.css";
import "./presentation/styles/tutorial.css";
/* Keep the command-bar typography as the final legacy CSS authority. */
import "./presentation/styles/command-bar-fixes.css";
/* Single responsive authority for the complete match-table composition. */
import "./presentation/styles/match-reference.css";
/* Final, isolated authority for the canonical in-match hero card. */
import "./presentation/styles/hero-panel-reference.css";
/* Small continuation of the same canonical positioning model. */
import "./presentation/styles/hero-panel-reference-tuning.css";
/* Final narrow geometry pass for compact/expanded hero breathing room. */
import "./presentation/styles/hero-panel-breathing-room.css";
/* Compact portrait level badge and readable progress/evolve spacing. */
import "./presentation/styles/hero-panel-compact-fix.css";
/* Last authority for the visible NÍVEL badge in compact and expanded panels. */
import "./presentation/styles/hero-panel-level-final.css";
/* External geometry only: hero panels are overlays and never size board tracks. */
import "./presentation/styles/hero-panel-overlay-isolation.css";
/* Restored commit 22b1999b canonical refinement. */
import "./presentation/styles/hero-panel-final-refinement.css";
/* Requested polish only: dimensions/offsets, never a replacement layout model. */
import "./presentation/styles/hero-panel-requested-polish.css";
/* Latest screenshot corrections: single progress label and terrain clearance. */
import "./presentation/styles/hero-panel-screenshot-fixes.css";
/* Interaction-only authority: evolution tooltip stays outside the hero panel. */
import "./presentation/styles/hero-panel-tooltip-final.css";
/* Final geometry authority: safe margins, contained compact footer and owner terrain. */
import "./presentation/styles/hero-panel-layout-final.css";
/* Terminal balance: edge-to-edge hero artwork and readable compact ability rows. */
import "./presentation/styles/hero-panel-visual-balance-final.css";
/* True terminal polish: readable progress, stable terrain drop footprint and hero-art identity. */
import "./presentation/styles/hero-panel-polish-terminal.css";
/* Drag-cycle invariant: terrain targets remain visible while React toggles can-drop. */
import "./presentation/styles/terrain-drag-stability.css";
/* Final responsive type/space distribution for expanded abilities and the match header. */
import "./presentation/styles/match-readability-final.css";
/* Final interaction state: stable EVOLUIR swap, actionable aura and always-visible active effects. */
import "./presentation/styles/hero-panel-interaction-status-final.css";
/* Specificity guard: state-qualified legacy rules may never hide active hero effects again. */
import "./presentation/styles/hero-status-visibility-final.css";
/* Requested terminal polish: tooltip, larger HUD copy and phase-orb affordance. */
import "./presentation/styles/requested-match-polish-final.css";
/* Absolute terminal authority for tooltip stacking and active phase-orb readability. */
import "./presentation/styles/match-overlay-visibility-final.css";
/* Body-level evolution criteria portal escapes every match-board stacking context. */
import "./presentation/styles/evolution-tooltip-portal-final.css";
/* Every floating tooltip/portal gets the final visual layer over cards and overlays. */
import "./presentation/styles/global-tooltip-layer-final.css";
/* Final gameplay feedback authority: evolution, defender lane, priority center and phase copy. */
import "./presentation/styles/match-feedback-final.css";
/* Terminal phase-orb typography and mandatory Indomitable warning readability. */
import "./presentation/styles/phase-orb-copy-final.css";
/* Canonical ability-row contract: keep this as the final CSS import. */
import "./presentation/styles/hero-ability-layout-contract.css";
import MatchUiGuard from "./presentation/match/match-ui-guard";
import MatchUiRuntime from "./presentation/match/match-ui-runtime";
import OnlineMatchRuntime from "./application/online/online-match-runtime";
import OnlineReconnectRuntime from "./application/online/online-reconnect-runtime";
import GameGlossaryRuntime from "./presentation/glossary/game-glossary-runtime";
import CardPreviewRuntime from "./presentation/cards/card-preview-runtime";
import PresentationEventBridge from "./presentation/runtime/presentation-event-bridge";
import PresentationInteractionRuntime from "./presentation/runtime/presentation-interaction-runtime";
import GamePresentationRuntime from "./presentation/runtime/game-presentation-runtime";
import HeroPanelExpandRuntime from "./presentation/runtime/hero-panel-expand-runtime";
import TerrainFieldAnchorRuntime from "./presentation/runtime/terrain-field-anchor-runtime";
import EvolutionTooltipPortalRuntime from "./presentation/runtime/evolution-tooltip-portal-runtime";
import MatchFeedbackRuntime from "./presentation/runtime/match-feedback-runtime";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Hemsfell Heroes",
  description: "Duelo digital de cartas no universo fantástico de Hemsfell.",
  other: { "codex-preview": "development" },
  icons: { icon: "/brand/hemsfell-heroes-mark-hq.png", shortcut: "/brand/hemsfell-heroes-mark-hq.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" suppressHydrationWarning>
    <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <MatchUiGuard />
      <MatchUiRuntime />
      <OnlineMatchRuntime />
      <OnlineReconnectRuntime />
      <GameGlossaryRuntime />
      <CardPreviewRuntime />
      <PresentationEventBridge />
      <PresentationInteractionRuntime />
      <GamePresentationRuntime />
      <HeroPanelExpandRuntime />
      <TerrainFieldAnchorRuntime />
      <EvolutionTooltipPortalRuntime />
      <MatchFeedbackRuntime />
      {children}
    </body>
  </html>;
}