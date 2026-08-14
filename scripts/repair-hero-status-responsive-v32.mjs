import { readFile, writeFile } from "node:fs/promises";

const read = async (path) => (await readFile(path, "utf8")).replace(/\r\n/g, "\n");

const cssPath = "app/ui-hero-status-v32.css";
const css = `/* Hero status cues v32 — responsive sizing and safe text wrapping. */
.screen-game .player-hero:not(.enemy){overflow:visible!important}
.screen-game .player-hero:not(.enemy) .hero-status-cues.local{
  left:clamp(6.7rem,9.15cqw,7.4rem)!important;
  right:auto!important;
  top:clamp(6.25rem,9.2cqh,7.3rem)!important;
  bottom:auto!important;
  width:clamp(6.4rem,10.2cqw,8.6rem)!important;
  max-width:min(8.6rem,calc(100cqw - 7.2rem))!important;
  min-width:0!important;
  transform:none!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:stretch!important;
  gap:clamp(.18rem,.32cqh,.34rem)!important;
  z-index:90!important;
  overflow:visible!important;
}
.screen-game .player-hero:not(.enemy) .hero-status-cues.local span{
  box-sizing:border-box!important;
  display:block!important;
  width:100%!important;
  min-width:0!important;
  max-width:100%!important;
  padding:clamp(.24rem,.4cqh,.4rem) clamp(.28rem,.45cqw,.52rem)!important;
  font-size:clamp(.39rem,.58cqw,.56rem)!important;
  line-height:1.12!important;
  letter-spacing:clamp(.01em,.035cqw,.05em)!important;
  white-space:normal!important;
  overflow-wrap:anywhere!important;
  word-break:normal!important;
  hyphens:auto!important;
  text-wrap:balance!important;
  text-overflow:clip!important;
  overflow:hidden!important;
}
.screen-game .player-hero:not(.enemy) .hero-status-cues.local .cue-empty{
  font-size:clamp(.36rem,.52cqw,.5rem)!important;
}
@container hemsfell-board (max-width:75rem){
  .screen-game .player-hero:not(.enemy) .hero-status-cues.local{
    left:clamp(6.2rem,8.9cqw,6.85rem)!important;
    width:clamp(5.8rem,9.4cqw,7.5rem)!important;
    max-width:min(7.5rem,calc(100cqw - 6.7rem))!important;
  }
  .screen-game .player-hero:not(.enemy) .hero-status-cues.local span{
    padding:.28rem .34rem!important;
    font-size:clamp(.37rem,.55cqw,.5rem)!important;
    letter-spacing:.02em!important;
  }
}
@container hemsfell-board (max-width:60rem){
  .screen-game .player-hero:not(.enemy) .hero-status-cues.local{
    left:clamp(5.7rem,8.6cqw,6.3rem)!important;
    top:clamp(5.8rem,8.8cqh,6.65rem)!important;
    width:clamp(5.25rem,8.9cqw,6.65rem)!important;
    max-width:min(6.65rem,calc(100cqw - 6.1rem))!important;
  }
  .screen-game .player-hero:not(.enemy) .hero-status-cues.local span{
    padding:.24rem .28rem!important;
    font-size:clamp(.35rem,.52cqw,.46rem)!important;
    line-height:1.08!important;
  }
}
@container hemsfell-board (max-height:44rem){
  .screen-game .player-hero:not(.enemy) .hero-status-cues.local{
    top:clamp(5.65rem,8.4cqh,6.65rem)!important;
    gap:.18rem!important;
  }
  .screen-game .player-hero:not(.enemy) .hero-status-cues.local span{
    padding-block:.22rem!important;
    font-size:clamp(.35rem,.5cqw,.46rem)!important;
  }
}
@container hemsfell-board (max-height:36rem){
  .screen-game .player-hero:not(.enemy) .hero-status-cues.local{
    left:clamp(5.35rem,8.2cqw,5.9rem)!important;
    top:clamp(5.2rem,7.9cqh,5.85rem)!important;
    width:clamp(4.9rem,8.3cqw,5.9rem)!important;
    max-width:min(5.9rem,calc(100cqw - 5.7rem))!important;
  }
  .screen-game .player-hero:not(.enemy) .hero-status-cues.local span{
    padding:.18rem .22rem!important;
    font-size:clamp(.32rem,.46cqw,.41rem)!important;
    letter-spacing:0!important;
    line-height:1.05!important;
  }
}
`;
await writeFile(cssPath, css);

const globalsPath = "app/globals.css";
let globals = await read(globalsPath);
const importLine = '@import "./ui-hero-status-v32.css";';
if (!globals.includes(importLine)) {
  const imports = [...globals.matchAll(/^@import[^;]+;\n?/gm)];
  const insertAt = imports.length ? imports[imports.length - 1].index + imports[imports.length - 1][0].length : 0;
  globals = globals.slice(0, insertAt) + importLine + "\n" + globals.slice(insertAt);
}
await writeFile(globalsPath, globals);

console.log("v32 applied: local Hero Status Cues are responsive and text stays inside each cue panel.");
