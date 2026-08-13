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

  // Runtime normalization must tolerate malformed/optional keyword entries. Some generated
  // effects can legitimately leave an undefined value in a keyword array for one render.
  source = replaceOnce(
    source,
    'const cleanName=(value:string)=>value.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g," ").trim().toLowerCase();',
    'const cleanName=(value:unknown)=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g," ").trim().toLowerCase();',
    "null-safe cleanName"
  );

  // Returned cards can carry a temporary per-card modifier (Mete o Pé). The UI/local
  // gameplay cost calculator must consume the same modifier the rules engine stores.
  source = replaceOnce(
    source,
    'const effectiveCost=(c:CardDef,p:Player)=>{let cost=c.cost;',
    'const effectiveCost=(c:CardDef,p:Player)=>{let cost=c.cost+Number((c as CardDef&{costModifier?:number}).costModifier||0);',
    "returned-card cost modifier"
  );

  // Bot games previously had no owner-1 resolver for engine target decisions. Gimble is
  // especially visible because Dragon Images immediately open Primeiro Ato target choices,
  // leaving the local player stuck behind “O oponente está escolhendo um efeito...”.
  const aiLoopMarker = ' useEffect(()=>{\n  if(!game||game.active!==1||game.winner!==null||mode!=="bot"||responseWindow||combatAction||game.phase==="combate"||visualFx||visualFxQueue.length)return;';
  if (!source.includes("BOT_ENGINE_DECISION_V18")) {
    if (!source.includes(aiLoopMarker)) throw new Error("Patch point not found: bot AI loop");
    const botDecisionEffect = ` useEffect(()=>{\n  /* BOT_ENGINE_DECISION_V18: resolve engine-owned choices before the normal AI loop. */\n  const decision=game?.pendingDecision;if(!game||mode!==\"bot\"||!decision||decision.owner!==1)return;\n  const timer=window.setTimeout(()=>{\n   const current=game.pendingDecision;if(!current||current.owner!==1)return;\n   const allOptions=(step:any,selected:string[]=[])=>game.players.flatMap((entry,targetOwner)=>[...entry.board.map(unit=>({id:unit.uid,kind:\"creature\",card:unit,targetOwner})),...entry.support.map(unit=>({id:unit.uid,kind:\"permanent\",card:unit,targetOwner})),...(entry.terrain?[{id:entry.terrain.uid,kind:\"permanent\",card:entry.terrain,targetOwner}]:[])].filter(option=>isValidTarget(step,1,targetOwner,option.kind)&&(!step?.requiredSubtype||hasSubtype(option.card,step.requiredSubtype))&&(!step?.requiredName||cleanName(option.card.name)===cleanName(step.requiredName))&&(!step?.imageOnly||!!option.card.generatedImage||!!option.card.imageCard)&&(step?.maxCost==null||option.card.cost<=step.maxCost)&&!(step?.excludeIds||[]).includes(option.id)&&!selected.includes(option.id)));\n   if([\"targets\",\"activation-targets\"].includes(current.kind)){const picked:string[]=[];for(const step of current.targetSteps||[]){const options=allOptions(step,picked);const preferred=options.find(option=>option.targetOwner===0)||options[0];if(!preferred)return;picked.push(preferred.id)}if(picked.length)void runRulesCommand({type:\"resolveDecision\",targetIds:picked},1);return}\n   if(current.kind===\"choice-target\"){const step=current.targetSteps?.[0]||{scope:\"anyCreature\"};const options=allOptions(step);const preferred=options.find(option=>option.targetOwner===0)||options[0];if(preferred)void runRulesCommand({type:\"resolveDecision\",choiceIndex:0,targetIds:[preferred.id]},1);else void runRulesCommand({type:\"resolveDecision\",choiceIndex:1},1);return}\n   if((current.effect?.choices||[]).length){void runRulesCommand({type:\"resolveDecision\",choiceIndex:0},1);return}\n   if(current.kind===\"draw-position\"||current.kind===\"redirect\"){void runRulesCommand({type:\"resolveDecision\",choiceIndex:0},1);return}\n  },360);return()=>window.clearTimeout(timer)\n },[game,mode]);\n\n`;
    source = source.replace(aiLoopMarker, botDecisionEffect + aiLoopMarker);
  }

  await write(path, source);
}

{
  const path = "app/ui-readability-v18.css";
  const css = `/* Hemsfell Heroes — resource readability v18 */\n.screen-game .field-energy>div>b{font-size:clamp(.68rem,.92cqw,.94rem)!important;line-height:1!important;letter-spacing:.055em!important;font-weight:900!important}\n.screen-game .field-energy>div>strong{font-size:clamp(.66rem,.86cqw,.9rem)!important;line-height:1!important;font-weight:900!important}\n.screen-game .field-energy .reserve-track>b{font-size:clamp(.66rem,.88cqw,.9rem)!important}\n@container hemsfell-board (max-height:44rem){.screen-game .field-energy>div>b{font-size:clamp(.62rem,.82cqw,.84rem)!important}.screen-game .field-energy>div>strong{font-size:clamp(.6rem,.78cqw,.8rem)!important}}\n`;
  await write(path, css);
  const globalsPath = "app/globals.css";
  let globals = await read(globalsPath);
  const importLine = '@import "./ui-readability-v18.css";';
  if (!globals.includes(importLine)) globals += `\n${importLine}\n`;
  await write(globalsPath, globals);
}

console.log("v18 applied: null-safe keywords, Gimble/AI engine decisions, Mete o Pé cost modifier and larger energy labels.");
await import("./repair-priority-multiplayer-v19.mjs");
await import("./repair-board-visual-polish-v20.mjs");
