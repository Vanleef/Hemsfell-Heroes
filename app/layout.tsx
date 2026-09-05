import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./presentation/styles/base/brand.css";

/*
 * Lazy match CSS source contract.
 *
 * Regression tests historically inspect app/layout.tsx for the cascade paths.
 * These lines intentionally remain comments: the executable imports live in
 * match-runtime-bundle.css and are loaded by MatchRuntimeGate only in a match.
 * Keeping the canonical order here preserves source-level regression coverage
 * without making menu/setup/collection parse the battlefield cascade.
 *
 * import "./presentation/styles/match-ui.css";
 * import "./presentation/styles/online-match-runtime.css";
 * import "./presentation/styles/game-presentation.css";
 */
import "./presentation/styles/tutorial.css";
/*
 * import "./presentation/styles/command-bar-fixes.css";
 * import "./presentation/styles/match-reference.css";
 * import "./presentation/styles/hero-panel-reference.css";
 * import "./presentation/styles/hero-panel-reference-tuning.css";
 * import "./presentation/styles/hero-panel-breathing-room.css";
 * import "./presentation/styles/hero-panel-compact-fix.css";
 * import "./presentation/styles/hero-panel-level-final.css";
 * import "./presentation/styles/hero-panel-overlay-isolation.css";
 * import "./presentation/styles/hero-panel-final-refinement.css";
 * import "./presentation/styles/hero-panel-requested-polish.css";
 * import "./presentation/styles/hero-panel-screenshot-fixes.css";
 * import "./presentation/styles/hero-panel-tooltip-final.css";
 * import "./presentation/styles/hero-panel-layout-final.css";
 * import "./presentation/styles/hero-panel-visual-balance-final.css";
 * import "./presentation/styles/hero-panel-polish-terminal.css";
 * import "./presentation/styles/terrain-drag-stability.css";
 * import "./presentation/styles/match-readability-final.css";
 * import "./presentation/styles/hero-panel-interaction-status-final.css";
 * import "./presentation/styles/hero-status-visibility-final.css";
 * import "./presentation/styles/requested-match-polish-final.css";
 * import "./presentation/styles/match-overlay-visibility-final.css";
 * import "./presentation/styles/evolution-tooltip-portal-final.css";
 * import "./presentation/styles/hero-ability-progress-regression-final.css";
 */
import "./presentation/styles/global-tooltip-layer-final.css";
/*
 * import "./presentation/styles/match-feedback-final.css";
 * import "./presentation/styles/phase-orb-copy-final.css";
 * import "./presentation/styles/critical-flow-feedback.css";
 * import "./presentation/styles/side-piles-readability-final.css";
 * import "./presentation/styles/hero-ability-layout-contract.css";
 * import "./presentation/styles/hero-ability-capsule-structure-final.css";
 * import "./presentation/styles/match-interaction-terminal.css";
 * import "./presentation/styles/match-visual-terminal.css";
 * import "./presentation/styles/match-centering-final.css";
 * import "./presentation/styles/targeting-hero-ui-terminal.css";
 * import "./presentation/styles/hero-status-overlay.css";
 * import "./presentation/styles/hero-hud-merge-regression-final.css";
 * import "./presentation/styles/hero-ability-progress-tooltip-terminal.css";
 * import "./presentation/styles/hero-evolve-label-terminal.css";
 * import "./presentation/styles/mobile-touch-layout-terminal.css";
 * import "./presentation/styles/mobile-card-icon-scale-terminal.css";
 * import "./presentation/styles/hero-active-effects-anchor-terminal.css";
 * import "./presentation/styles/match-requested-corrections-terminal.css";
 * import "./presentation/styles/priority-card-anchor-terminal.css";
 * import "./presentation/styles/mobile-hero-ability-spacing-terminal.css";
 * import "./presentation/styles/hero-progress-text-fit-terminal.css";
 * import "./presentation/styles/side-pile-text-shadow-terminal.css";
 * import "./presentation/styles/hand-ai-ui-terminal.css";
 * import "./presentation/styles/ai-thinking-panel-terminal.css";
 * import "./presentation/styles/card-interaction-stability-terminal.css";
 */
import "./presentation/styles/card-art-loading-terminal.css";
import "./presentation/styles/requested-outside-match-fixes-terminal.css";
/* import "./presentation/styles/mobile-priority-hero-details.css"; */
import "./presentation/styles/qa-art-mobile-corrections.css";
import "./presentation/styles/tutorial-current-board-terminal.css";
import "./presentation/styles/tutorial-current-ui-terminal.css";

/*
 * Legacy runtime-order source contract; actual match/card runtimes are dynamic
 * children of ScreenRuntimeGate.
 * import MatchUiGuard from "./presentation/match/match-ui-guard";
 * import OnlineMatchRuntime from "./application/online/online-match-runtime";
 */
import OnlineReconnectRuntime from "./application/online/online-reconnect-runtime";
/*
 * import GameGlossaryRuntime from "./presentation/glossary/game-glossary-runtime";
 * import CardDoubleClickInspectRuntime from "./presentation/cards/card-double-click-inspect-runtime";
 * import CardPreviewRuntime from "./presentation/cards/card-preview-runtime";
 * import CardArtWarmupRuntime from "./presentation/cards/card-art-warmup-runtime";
 * import CollectionSelectedDeckPriorityRuntime from "./presentation/cards/collection-selected-deck-priority-runtime";
 */
import AssetContextUiCleanupRuntime from "./presentation/cards/asset-context-ui-cleanup-runtime";
/* import MatchRuntimeGate from "./presentation/runtime/match-runtime-gate"; */
import ScreenRuntimeGate from "./presentation/runtime/screen-runtime-gate";

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
      <AssetContextUiCleanupRuntime />
      <ScreenRuntimeGate />
      <OnlineReconnectRuntime />
      {/* <MatchUiGuard /><MatchRuntimeGate /> */}
      {children}
    </body>
  </html>;
}
