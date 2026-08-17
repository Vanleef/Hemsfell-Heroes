import fs from "node:fs";
const path = "tests/rules-engine.test.mjs";
let text = fs.readFileSync(path, "utf8");
const from = "assert.equal(explicitRuleIds.length, 255);";
const to = "assert.equal(explicitRuleIds.length, 256);";
if (!text.includes(from) && !text.includes(to)) throw new Error("explicitRuleIds assertion not found");
text = text.replace(from, to);
fs.writeFileSync(path, text);
