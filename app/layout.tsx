import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./brand.css";
import "./match-ui.css";
import "./online-match-runtime.css";
import MatchUiGuard from "./match-ui-guard";
import MatchUiRuntime from "./match-ui-runtime";
import OnlineMatchRuntime from "./online-match-runtime";
import OnlineReconnectRuntime from "./online-reconnect-runtime";
import CardPreviewRuntime from "./card-preview-runtime";

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
    icon: "/brand/hemsfell-heroes-mark-hq.png",
    shortcut: "/brand/hemsfell-heroes-mark-hq.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <MatchUiGuard />
        <MatchUiRuntime />
        <OnlineMatchRuntime />
        <OnlineReconnectRuntime />
        <CardPreviewRuntime />
        {children}
      </body>
    </html>
  );
}
