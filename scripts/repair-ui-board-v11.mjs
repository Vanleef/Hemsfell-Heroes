import { readFile, writeFile } from "node:fs/promises";

const normalize = (value) => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const path = "app/globals.css";
let source = normalize(await readFile(path, "utf8"));
const importLine = '@import "./ui-board-polish-v11.css";';
if (!source.includes(importLine)) {
  const anchor = '@import "./ui-board-polish-v10.css";';
  if (!source.includes(anchor)) throw new Error("Could not locate v10 import in globals.css.");
  source = source.replace(anchor, `${anchor}\n${importLine}`);
  await writeFile(path, normalize(source));
}
console.log("Responsive hero progression and defense choice polish v11 applied.");
