import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Vercel serverless launcher may require compiled Next API routes", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.notEqual(packageJson.type, "module", "the Vercel CommonJS launcher cannot require route.js beneath a type=module package scope");
});
