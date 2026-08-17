import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./command-bar-fixes.css";
import "./match-ui-guard.css";
import "./setup-heading-fixes.css";
import "./response-hover-layer.css";
import "./card-list-scrollviews.css";
import "./card-list-grid-layout.css";
import "./card-list-grid-fit.css";
import "./decision-lane-position.css";
import "./target-banner-anchor.css";
import "./hero-inspector-fix.css";
import "./match-result-enhancer.css";
import CommandBarTextAutoFit from "./command-bar-text-autofit";
import MatchUiGuard from "./match-ui-guard";
import CardListTooltipPortal from "./card-list-tooltip-portal";
import TargetBannerPositionGuard from "./target-banner-position-guard";
import MatchResultEnhancer from "./match-result-enhancer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Hemsfell Heroes — Jogo de Cartas",
  description: "Duelo digital de cartas no universo fantástico de Hemsfell.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <CommandBarTextAutoFit />
        <MatchUiGuard />
        <TargetBannerPositionGuard />
        <CardListTooltipPortal />
        <MatchResultEnhancer />
        {children}
      </body>
    </html>
  );
}
