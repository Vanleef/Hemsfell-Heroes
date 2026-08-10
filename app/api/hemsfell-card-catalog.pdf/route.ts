/**
 * Streams the official Hemsfell PDF catalogue to the browser renderer.
 * The upstream file is large, so it must never be cloned or stored in the
 * Next.js data cache inside a serverless function.
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
        cache: "no-store",
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
