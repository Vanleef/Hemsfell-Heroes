import { readFile, writeFile } from "node:fs/promises";

const read = async (path) => (await readFile(path, "utf8")).replace(/\r\n/g, "\n");

// Keep the local player's status cues in a guaranteed-visible region immediately
// below the evolve button. Enemy cues keep their existing placement.
{
  const cssPath = "app/ui-player-hero-status-v30.css";
  const css = `/* Player hero status positioning v30 */
.screen-game .player-hero:not(.enemy){overflow:visible!important}
.screen-game .player-hero:not(.enemy)>button.level-button{
  right:-150px!important;
  top:auto!important;
  bottom:38px!important;
  width:142px!important;
  height:34px!important;
  z-index:64!important;
}
.screen-game .player-hero:not(.enemy) .hero-status-cues{
  left:auto!important;
  right:-150px!important;
  top:auto!important;
  bottom:2px!important;
  transform:none!important;
  z-index:65!important;
  display:flex!important;
  visibility:visible!important;
  opacity:1!important;
  pointer-events:auto!important;
}
.screen-game .player-hero:not(.enemy) .hero-status-cues.cost{
  left:auto!important;
  right:-298px!important;
  top:auto!important;
  bottom:2px!important;
}
.screen-game .player-hero:not(.enemy) .hero-status-cues span{
  min-width:142px!important;
  position:relative!important;
  z-index:66!important;
}
@container hemsfell-board (max-width:75rem){
  .screen-game .player-hero:not(.enemy)>button.level-button{right:-132px!important;width:126px!important}
  .screen-game .player-hero:not(.enemy) .hero-status-cues{right:-132px!important}
  .screen-game .player-hero:not(.enemy) .hero-status-cues.cost{right:-264px!important}
  .screen-game .player-hero:not(.enemy) .hero-status-cues span{min-width:126px!important;padding-inline:8px!important;font-size:10px!important}
}
`;
  await writeFile(cssPath, css);

  const globalsPath = "app/globals.css";
  let globals = await read(globalsPath);
  const importLine = '@import "./ui-player-hero-status-v30.css";';
  if (!globals.includes(importLine)) {
    const imports = [...globals.matchAll(/^@import[^;]+;\n?/gm)];
    const insertAt = imports.length ? imports[imports.length - 1].index + imports[imports.length - 1][0].length : 0;
    globals = globals.slice(0, insertAt) + importLine + "\n" + globals.slice(insertAt);
  }
  await writeFile(globalsPath, globals);
}

console.log("v30 applied: local hero status cues remain visible below EVOLUIR without changing enemy cues.");
