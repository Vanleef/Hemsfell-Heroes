import { readFile, writeFile } from "node:fs/promises";

const read = async (path) => (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
const write = (path, value) => writeFile(path, value);
const replaceOnce = (source, before, after, label) => {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Patch point not found: ${label}`);
  return source.replace(before, after);
};

{
  const path = "app/page.tsx";
  let source = await read(path);
  source = replaceOnce(source,'{unit&&<>{unit.type==="Criatura"&&<><span className={`live-atk ${modifiers.atk>0?"is-buffed":modifiers.atk<0||unit.frozen?"is-weakened":""}`}>{liveAttack}</span><span className={`live-hp ${modifiers.hp>0?"is-buffed":modifiers.hp<0?"is-weakened":""}`}>{liveVitality}</span></>}{unit.summoning&&<i className="summoning-sickness-badge summoning-sickness-icon" title="Enjoo de invocação: esta carta não pode atacar nem usar efeitos ativáveis no turno em que entra em campo." aria-label="Enjoo de invocação">◷</i>}{activeEffect&&<i className="active-effect-label">{activeEffect}</i>}{(unit.exhausted||unit.frozen||unit.stunned||unit.suffocated||unit.immobilized)&&<i className="status">{unit.suffocated?"SUFOCADA":unit.stunned?"ATORDOADA":unit.frozen?"CONGELADA":unit.immobilized?"IMOBILIZADA":"VIRADA"}</i>}</>}','{unit&&<>{unit.type==="Criatura"&&<><span className={`live-atk ${modifiers.atk>0?"is-buffed":modifiers.atk<0||unit.frozen?"is-weakened":""}`}>{liveAttack}</span><span className={`live-hp ${modifiers.hp>0?"is-buffed":modifiers.hp<0?"is-weakened":""}`}>{liveVitality}</span></>}{unit.summoning&&<i className="summoning-sickness-badge summoning-sickness-icon" title="Enjoo de invocação: esta carta não pode atacar nem usar efeitos ativáveis no turno em que entra em campo." aria-label="Enjoo de invocação">◷</i>}{(unit.exhausted||unit.frozen||unit.stunned||unit.suffocated||unit.immobilized)&&<i className="status">{unit.suffocated?"SUFOCADA":unit.stunned?"ATORDOADA":unit.frozen?"CONGELADA":unit.immobilized?"IMOBILIZADA":"VIRADA"}</i>}</>}',"remove active effect plaque");
  source = replaceOnce(source,'const negativeState=unit?.suffocated?"status-suffocated":unit?.stunned?"status-stunned":unit?.frozen?"status-frozen":unit?.immobilized?"status-immobilized":"";','const negativeState=unit?.suffocated?"status-suffocated":unit?.stunned?"status-stunned":unit?.frozen?"status-frozen":unit?.immobilized?"status-immobilized":"",tessaliaCommander=!!unit&&controller?.heroId==="tessalia"&&unit.type==="Criatura"&&unit.slot===2;',"tessalia commander visual flag");
  source = replaceOnce(source,'return <span className={`card-frame ${small?"is-small":""}`} data-unit-id={unit?.uid}>','return <span className={`card-frame ${small?"is-small":""} ${tessaliaCommander?"tessalia-commander-frame":""}`} data-unit-id={unit?.uid}>',"tessalia commander frame class");
  await write(path, source);
}

{
  const path = "app/ui-board-visual-polish-v20.css";
  const css = `/* Hemsfell Heroes — board visual polish v20 */\n.screen-game .active-effect-label{display:none!important}\n.screen-game .card-frame.tessalia-commander-frame{isolation:isolate;filter:drop-shadow(0 0 clamp(.18rem,.42cqw,.5rem) rgba(226,48,48,.72))}\n.screen-game .card-frame.tessalia-commander-frame::before{content:\"\";position:absolute;inset:clamp(-.28rem,-.34cqw,-.16rem);z-index:5;pointer-events:none;border:clamp(2px,.16cqw,3px) solid rgba(255,76,67,.96);border-radius:clamp(.5rem,.8cqw,.85rem);box-shadow:0 0 0 1px rgba(255,196,108,.58),0 0 clamp(.55rem,1.05cqw,1.1rem) rgba(221,34,34,.58),inset 0 0 clamp(.35rem,.65cqw,.7rem) rgba(176,22,22,.2);clip-path:polygon(0 0,31% 0,35% 4%,65% 4%,69% 0,100% 0,100% 29%,96% 34%,96% 66%,100% 71%,100% 100%,69% 100%,65% 96%,35% 96%,31% 100%,0 100%,0 71%,4% 66%,4% 34%,0 29%)}\n.screen-game .card-frame.tessalia-commander-frame .original-card{box-shadow:inset 0 0 0 1px rgba(255,80,70,.72),0 0 clamp(.35rem,.7cqw,.75rem) rgba(218,38,38,.44)!important}\n.screen-game .card-frame.tessalia-commander-frame .original-card::after{content:\"\";position:absolute;inset:2%;pointer-events:none;border-radius:inherit;background:linear-gradient(90deg,transparent 0 12%,rgba(255,50,50,.95) 19%,transparent 29% 71%,rgba(255,50,50,.95) 81%,transparent 88%),linear-gradient(0deg,transparent 0 10%,rgba(255,76,60,.9) 19%,transparent 29% 71%,rgba(255,76,60,.9) 81%,transparent 90%);background-size:210% 100%,100% 210%;mix-blend-mode:screen;opacity:.88;animation:tessaliaCommandLines 2.8s linear infinite}\n@keyframes tessaliaCommandLines{0%{background-position:110% 0,0 110%}100%{background-position:-110% 0,0 -110%}}\n.screen-game .pile-zone>span,.screen-game .pile-zone .pile-title,.screen-game .pile-zone b:first-of-type{font-size:clamp(.62rem,.78cqw,.88rem)!important;line-height:1.05!important;font-weight:900!important;letter-spacing:.055em!important}\n.screen-game .pile-zone>small,.screen-game .pile-zone .pile-count,.screen-game .pile-zone strong{font-size:clamp(.64rem,.82cqw,.94rem)!important;line-height:1!important;font-weight:900!important}\n@container hemsfell-board (max-height:44rem){.screen-game .pile-zone>span,.screen-game .pile-zone .pile-title,.screen-game .pile-zone b:first-of-type{font-size:clamp(.56rem,.68cqw,.76rem)!important}.screen-game .pile-zone>small,.screen-game .pile-zone .pile-count,.screen-game .pile-zone strong{font-size:clamp(.58rem,.72cqw,.82rem)!important}}\n@container hemsfell-board (max-height:36rem){.screen-game .pile-zone>span,.screen-game .pile-zone .pile-title,.screen-game .pile-zone b:first-of-type{font-size:clamp(.5rem,.61cqw,.68rem)!important}.screen-game .pile-zone>small,.screen-game .pile-zone .pile-count,.screen-game .pile-zone strong{font-size:clamp(.52rem,.64cqw,.72rem)!important}}\n`;
  await write(path, css);
  const globalsPath = "app/globals.css";
  let globals = await read(globalsPath);
  const importLine = '@import "./ui-board-visual-polish-v20.css";';
  if (!globals.includes(importLine)) globals += `\n${importLine}\n`;
  await write(globalsPath, globals);
}

console.log("v20 applied: icon-only active effects, Tessalia Commander frame and responsive pile labels.");
await import("./repair-tessalia-cards-v21.mjs");
