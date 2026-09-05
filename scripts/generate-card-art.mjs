import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_PATH = path.join(ROOT, "app/data/catalog/cards.generated.json");
const MANIFEST_PATH = path.join(ROOT, "app/data/catalog/card-art.generated.json");
const VERSION = process.env.HEMSFELL_CARD_ART_VERSION || "v1";
const WIDTHS = [160, 320, 640];
const OUTPUT_DIR = path.join(ROOT, "public/cards/generated", VERSION);
const TOOL_DIR = path.join(ROOT, ".card-art-tools");
const CANVAS_VERSION = "1.0.8";
const STRICT = process.env.HEMSFELL_CARD_ART_STRICT === "1";
const FORCE = process.argv.includes("--force");
const SKIP = process.env.HEMSFELL_CARD_ART_SKIP === "1";
const CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.HEMSFELL_CARD_ART_CONCURRENCY || 2)));
const FILE_ID = "1gI26HASPp9KM_GtloaqBIj8ukY7Nq3CC";
const CATALOG_URLS = [
  process.env.HEMSFELL_CARD_CATALOG_URL,
  `https://drive.usercontent.google.com/download?id=${FILE_ID}&export=download&confirm=t`,
  `https://drive.google.com/uc?export=download&id=${FILE_ID}&confirm=t`,
].filter(Boolean);

const pageFile = (page, width) => path.join(OUTPUT_DIR, `card-${String(page).padStart(3, "0")}-${width}.webp`);

async function currentManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  } catch {
    return { version: VERSION, widths: WIDTHS, pages: [] };
  }
}

async function completeOnDisk(pages) {
  if (FORCE) return false;
  const manifest = await currentManifest();
  if (manifest.version !== VERSION || !Array.isArray(manifest.pages) || manifest.pages.length !== pages.length) return false;
  for (const page of pages) {
    for (const width of WIDTHS) {
      try { await fs.access(pageFile(page, width)); }
      catch { return false; }
    }
  }
  return true;
}

async function loadCanvasModule() {
  try {
    return await import("@napi-rs/canvas");
  } catch {
    // Keep the application lockfile unchanged: this renderer exists only while
    // producing build artifacts and is installed in an isolated tool prefix.
    await fs.mkdir(TOOL_DIR, { recursive: true });
    await fs.writeFile(path.join(TOOL_DIR, "package.json"), JSON.stringify({ private: true }, null, 2) + "\n");
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    console.log(`[card-art] installing isolated @napi-rs/canvas@${CANVAS_VERSION} renderer...`);
    execFileSync(npm, [
      "install",
      "--prefix", TOOL_DIR,
      "--no-package-lock",
      "--no-save",
      "--omit=dev",
      `@napi-rs/canvas@${CANVAS_VERSION}`,
    ], { cwd: ROOT, stdio: "inherit", env: process.env });
    const toolRequire = createRequire(path.join(TOOL_DIR, "package.json"));
    return import(pathToFileURL(toolRequire.resolve("@napi-rs/canvas")).href);
  }
}

async function fetchCatalogue() {
  let lastError;
  for (const url of CATALOG_URLS) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          accept: "application/pdf, application/octet-stream;q=0.9, */*;q=0.1",
          "user-agent": "Hemsfell-Heroes-Card-Art-Build/1.0",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = (response.headers.get("content-type") || "").toLowerCase();
      const data = new Uint8Array(await response.arrayBuffer());
      const looksPdf = type.includes("pdf") || (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46);
      if (!looksPdf) throw new Error(`upstream returned ${type || "unknown content"}`);
      return data;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("card catalogue unavailable");
}

async function encodeScaled(master, width, height, createCanvas) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d", { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(master, 0, 0, width, height);
  return canvas.encode("webp", 82);
}

async function generate() {
  if (SKIP) {
    console.log("[card-art] skipped by HEMSFELL_CARD_ART_SKIP=1; runtime PDF fallback remains enabled");
    return;
  }

  const cards = JSON.parse(await fs.readFile(CATALOG_PATH, "utf8"));
  const pages = [...new Set(cards.map((card) => Number(card.page)).filter((page) => Number.isInteger(page) && page > 0))].sort((a, b) => a - b);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  if (await completeOnDisk(pages)) {
    console.log(`[card-art] ${pages.length} pages already generated for ${VERSION}`);
    return;
  }

  const [{ getDocument }, canvasModule] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    loadCanvasModule(),
  ]);
  const { createCanvas, DOMMatrix, ImageData, Path2D } = canvasModule;
  globalThis.DOMMatrix ??= DOMMatrix;
  globalThis.ImageData ??= ImageData;
  globalThis.Path2D ??= Path2D;

  console.log(`[card-art] downloading catalogue for ${pages.length} pages...`);
  const data = await fetchCatalogue();
  const document = await getDocument({ data, disableWorker: true, useSystemFonts: true }).promise;
  let cursor = 0;
  let completed = 0;

  const renderPage = async (pageNumber) => {
    const page = await document.getPage(pageNumber);
    try {
      const base = page.getViewport({ scale: 1 });
      const masterWidth = WIDTHS.at(-1);
      const scale = masterWidth / base.width;
      const viewport = page.getViewport({ scale });
      const master = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = master.getContext("2d", { alpha: false });
      await page.render({ canvasContext: context, viewport, canvas: master }).promise;
      const aspect = master.height / master.width;
      for (const width of WIDTHS) {
        const height = Math.max(1, Math.round(width * aspect));
        const encoded = width === master.width
          ? await master.encode("webp", 84)
          : await encodeScaled(master, width, height, createCanvas);
        await fs.writeFile(pageFile(pageNumber, width), encoded);
      }
    } finally {
      try { page.cleanup(); } catch { /* noop */ }
    }
  };

  const worker = async () => {
    while (cursor < pages.length) {
      const pageNumber = pages[cursor++];
      await renderPage(pageNumber);
      completed += 1;
      if (completed % 20 === 0 || completed === pages.length) console.log(`[card-art] ${completed}/${pages.length}`);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pages.length) }, worker));
  try { await document.cleanup(); } catch { /* noop */ }
  try { await document.destroy(); } catch { /* noop */ }
  await fs.writeFile(MANIFEST_PATH, JSON.stringify({ version: VERSION, widths: WIDTHS, pages }, null, 2) + "\n");
  console.log(`[card-art] generated ${pages.length * WIDTHS.length} WebP assets in ${path.relative(ROOT, OUTPUT_DIR)}`);
}

try {
  await generate();
} catch (error) {
  console.error("[card-art] generation failed:", error);
  if (STRICT) process.exitCode = 1;
  else console.warn("[card-art] continuing with PDF.js runtime fallback; set HEMSFELL_CARD_ART_STRICT=1 to make this fatal.");
}
