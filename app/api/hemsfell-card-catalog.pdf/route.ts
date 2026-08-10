/**
 * Serves the official Hemsfell PDF catalogue to the browser renderer.
 * Google occasionally changes one public download host, so the proxy accepts
 * only PDF responses and retries the canonical Drive download endpoint.
 */
const CATALOG_FILE_ID = "1gI26HASPp9KM_GtloaqBIj8ukY7Nq3CC";
const CATALOG_URLS = [
  `https://drive.usercontent.google.com/download?id=${CATALOG_FILE_ID}&export=download&confirm=t`,
  `https://drive.google.com/uc?export=download&id=${CATALOG_FILE_ID}`,
];

export const runtime = "nodejs";

export async function GET(request: Request) {
  const headers = new Headers({ Accept: "application/pdf" });
  const range = request.headers.get("range");
  if (range) headers.set("range", range);

  let upstream: Response | undefined;
  for (const url of CATALOG_URLS) {
    try {
      const candidate = await fetch(url, { headers, next: { revalidate: 3600 } });
      const contentType = candidate.headers.get("content-type") || "";
      if (candidate.ok && candidate.body && contentType.includes("application/pdf")) {
        upstream = candidate;
        break;
      }
    } catch (error) {
      console.error("[catalogue-pdf] upstream download failed", { url, error: String(error) });
    }
  }

  if (!upstream) {
    return new Response("Catálogo de cartas temporariamente indisponível.", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const responseHeaders = new Headers({
    "content-type": "application/pdf",
    "cache-control":
      "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    "x-content-type-options": "nosniff",
  });

  for (const name of [
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
