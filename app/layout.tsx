import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./presentation/styles/base/brand.css";
import "./presentation/styles/tutorial.css";
/* Shared card/tooltip surfaces also render in collection, setup and inspectors. */
import "./presentation/styles/global-tooltip-layer-final.css";
import "./presentation/styles/card-art-loading-terminal.css";
import "./presentation/styles/requested-outside-match-fixes-terminal.css";
import "./presentation/styles/qa-art-mobile-corrections.css";
/* Current tutorial board geometry mirrors the live match composition. */
import "./presentation/styles/tutorial-current-board-terminal.css";
import "./presentation/styles/tutorial-current-ui-terminal.css";
import OnlineReconnectRuntime from "./application/online/online-reconnect-runtime";
import AssetContextUiCleanupRuntime from "./presentation/cards/asset-context-ui-cleanup-runtime";
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
      {children}
    </body>
  </html>;
}
