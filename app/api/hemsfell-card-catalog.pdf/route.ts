/**
 * Streams the official Hemsfell PDF catalogue to the browser renderer.
 * Range chunks are cached upstream and at the CDN so repeated card pages do not
 * pay a Google Drive round-trip on every screen or browser session.
 */
const CATALOG_FILE_ID = "1gI26HASPp9KM_GtloaqBIj8ukY7Nq3CC";
const CATALOG_URLS = [
  `https://drive.usercontent.google.com/download?id=${CATALOG_FILE_ID}&export=download&confirm=t`,
  `https://drive.google.com/uc?export=download&id=${CATALOG_FILE_ID}&confirm=t`,
];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = new Headers({
    Accept: "application/pdf, application/octet-stream;q=0.9, */*;q=0.1",
  });
  const range = request.headers.get("range");
  if (range) headers.set("range", range);

  let upstream: Response | undefined;
  for (const url of CATALOG_URLS) {
    try {
      const candidate = await fetch(url, {
        headers,
        cache: "force-cache",
        next: { revalidate: 86400 },
        redirect: "follow",
      });
      const contentType = (candidate.headers.get("content-type") || "").toLowerCase();
      const disposition = (candidate.headers.get("content-disposition") || "").toLowerCase();
      const isDocument =
        contentType.includes("application/pdf") ||
        contentType.includes("application/octet-stream") ||
        disposition.includes(".pdf");

      if (candidate.ok && candidate.body && isDocument) {
        upstream = candidate;
        break;
      }

      candidate.body?.cancel().catch(() => undefined);
      console.warn("[catalogue-pdf] rejected upstream response", {
        status: candidate.status,
        contentType,
        url,
      });
    } catch (error) {
      console.error("[catalogue-pdf] upstream download failed", {
        url,
        error: String(error),
      });
    }
  }

  if (!upstream) {
    return new Response("Catálogo de cartas temporariamente indisponível.", {
      status: 502,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  const responseHeaders = new Headers({
    "content-type": "application/pdf",
    // Browsers keep useful range responses for a day; the edge keeps them much
    // longer so a cold client normally talks to Vercel instead of Google Drive.
    "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
    "cdn-cache-control": "public, s-maxage=604800, stale-while-revalidate=2592000",
    "vercel-cdn-cache-control": "public, s-maxage=604800, stale-while-revalidate=2592000",
    "x-content-type-options": "nosniff",
    vary: "Range",
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
