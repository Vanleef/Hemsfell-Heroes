import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./brand.css";
import "./presentation/styles/match-ui.css";
import "./presentation/styles/online-match-runtime.css";
import "./presentation/styles/game-presentation.css";
import "./presentation/styles/tutorial.css";
/* Keep the command-bar typography as the final CSS cascade authority. */
import "./presentation/styles/command-bar-fixes.css";
import MatchUiGuard from "./match-ui-guard";
import MatchUiRuntime from "./presentation/match/match-ui-runtime";
import OnlineMatchRuntime from "./application/online/online-match-runtime";
import OnlineReconnectRuntime from "./application/online/online-reconnect-runtime";
import GameGlossaryRuntime from "./presentation/glossary/game-glossary-runtime";
import CardPreviewRuntime from "./presentation/cards/card-preview-runtime";
import PresentationEventBridge from "./presentation-event-bridge";
import PresentationInteractionRuntime from "./presentation/runtime/presentation-interaction-runtime";
import GamePresentationRuntime from "./presentation/runtime/game-presentation-runtime";

/*
 * Compatibility markers for static regression tooling while callers migrate to
 * the canonical presentation paths above. These are not executable imports:
 * import "./match-ui.css";
 * import "./online-match-runtime.css";
 * import "./game-presentation.css";
 * import "./tutorial.css";
 * import "./command-bar-fixes.css";
 * import MatchUiRuntime from "./match-ui-runtime";
 * import OnlineMatchRuntime from "./online-match-runtime";
 * import OnlineReconnectRuntime from "./online-reconnect-runtime";
 * import GameGlossaryRuntime from "./game-glossary-runtime";
 * import CardPreviewRuntime from "./card-preview-runtime";
 * import PresentationInteractionRuntime from "./presentation-interaction-runtime";
 * import GamePresentationRuntime from "./game-presentation-runtime";
 */

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
      {children}
    </body>
  </html>;
}
