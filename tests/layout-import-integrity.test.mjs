import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const layoutUrl = new URL("../app/layout.tsx", import.meta.url);
const layout = await readFile(layoutUrl, "utf8");
const appDir = dirname(fileURLToPath(layoutUrl));

test("layout CSS imports resolve to existing files", async () => {
  const imports = [...layout.matchAll(/import\s+["'](\.\/.+?\.css)["'];?/g)].map((match) => match[1]);
  assert.ok(imports.length > 0, "expected at least one relative CSS import in app/layout.tsx");
  for (const specifier of imports) {
    await assert.doesNotReject(
      access(resolve(appDir, specifier)),
      `missing stylesheet imported by app/layout.tsx: ${specifier}`,
    );
  }
});

test("layout does not reference removed legacy setup stylesheet", () => {
  assert.doesNotMatch(layout, /setup-heading-fixes\.css/);
});
