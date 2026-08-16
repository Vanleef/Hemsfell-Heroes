import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./command-bar-fixes.css";
import "./match-ui-guard.css";
import CommandBarTextAutoFit from "./command-bar-text-autofit";
import MatchUiGuard from "./match-ui-guard";
import HeroFactionNormalizer from "./hero-faction-normalizer";
import TifonPickerNormalizer from "./tifon-picker-normalizer";

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
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <CommandBarTextAutoFit />
        <MatchUiGuard />
        <HeroFactionNormalizer />
        <TifonPickerNormalizer />
        {children}
      </body>
    </html>
  );
}
