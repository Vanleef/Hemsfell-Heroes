/**
 * Serves the official Hemsfell PDF catalogue to the browser renderer.
 *
 * The same-origin route keeps PDF.js independent from Google Drive CORS and
 * works in both local Next.js development and the production deployment.
 */
const CATALOG_FILE_ID = "1gI26HASPp9KM_GtloaqBIj8ukY7Nq3CC";
const CATALOG_URL =
  `https://drive.usercontent.google.com/download?id=${CATALOG_FILE_ID}&export=download&confirm=t`;

export const runtime = "nodejs";

export async function GET(request: Request) {
  const headers = new Headers({ Accept: "application/pdf" });
  const range = request.headers.get("range");
  if (range) headers.set("range", range);

  const upstream = await fetch(CATALOG_URL, {
    headers,
    next: { revalidate: 3600 },
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("Catálogo de cartas temporariamente indisponível.", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
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
