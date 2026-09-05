"use client";

import dynamic from "next/dynamic";

const HomeClient = dynamic(() => import("./home-client"), {
  ssr: false,
  loading: () => <main className="hh-app screen-menu" aria-busy="true" aria-label="Carregando Hemsfell Heroes" />,
});

/**
 * Keep the App Router entry tiny. The rules-heavy interactive client is loaded
 * as its own chunk after the server shell has been delivered, allowing route
 * metadata/layout and static assets to become usable without parsing the whole
 * match controller first.
 */
export default function HomeShell() {
  return <HomeClient />;
}
