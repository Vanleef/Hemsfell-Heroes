import { readFile, writeFile } from "node:fs/promises";

const normalize = (value) => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const read = async (path) => normalize(await readFile(path, "utf8"));
const write = async (path, value) => writeFile(path, normalize(value));

{
  const path = "app/globals.css";
  let source = await read(path);
  const importLine = '@import "./ui-board-polish-v9.css";';
  if (!source.includes(importLine)) {
    const anchor = '@import "./lab.css";';
    if (!source.includes(anchor)) throw new Error("Could not locate lab.css import in globals.css.");
    source = source.replace(anchor, `${anchor}\n${importLine}`);
    await write(path, source);
  }
}

{
  const path = "app/page.tsx";
  let source = await read(path);
  const legacy = 'onClick={onClick||(()=>requestCardInspection(card))} aria-label={displayName}';
  const repaired = 'onClick={event=>{event.stopPropagation();const interactionClick=!!onClick&&!!targetClass.trim();if(interactionClick){onClick?.();return}requestCardInspection(card)}} aria-label={displayName}';
  const laterRepaired = 'onClick={event=>{event.stopPropagation();const interactionClick=!!onClick&&(!inspectable||!!targetClass.trim());if(interactionClick){onClick?.();return}if(inspectable)requestCardInspection(card)}} aria-label={displayName}';
  if (!source.includes(repaired) && !source.includes(laterRepaired)) {
    if (!source.includes(legacy)) throw new Error("Could not locate OriginalCard click behavior.");
    source = source.replace(legacy, repaired);
    await write(path, source);
  }
}

console.log("Responsive right-lane, hero stack and card inspector polish v9 applied.");
