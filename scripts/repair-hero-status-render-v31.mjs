import { readFile, writeFile } from "node:fs/promises";

const read = async (path) => (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
const replaceOnce = (source, before, after, label) => {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`v31 patch point not found: ${label}`);
  return source.replace(before, after);
};

{
  const path = "app/page.tsx";
  let source = await read(path);

  source = replaceOnce(
    'elementChain?:{element:ElementName;effect:"Sufocado"|"Atordoado"|"Congelado"|"Imobilizado"};lastElement?:ElementName;',
    'elementChain?:{element:ElementName;effect:"Sufocado"|"Atordoado"|"Congelado"|"Imobilizado"};nextElementEffects?:Array<{element:ElementName;keyword:string;expires?:string}>;lastElement?:ElementName;',
    "Player authoritative elemental status type"
  );

  const oldSetup = ' const d=deckById(player.heroId),targets=levelTargets(player),need=targets[player.level-1]??999,cost=player.level===1?2:3,unit=d.requirement.match(/\\d+\\/\\d+\\s*(.*)/)?.[1]||"marcos",progress=heroEvolutionProgress(player),progressReady=player.level<3&&progress>=need,canLevel=progressReady&&player.levelUpsThisTurn===0&&canEvolveThisTurn,canAfford=player.energy+player.reserve>=cost;';
  const newSetup = ' const d=deckById(player.heroId),targets=levelTargets(player),need=targets[player.level-1]??999,cost=player.level===1?2:3,unit=d.requirement.match(/\\d+\\/\\d+\\s*(.*)/)?.[1]||"marcos",progress=heroEvolutionProgress(player),progressReady=player.level<3&&progress>=need,canLevel=progressReady&&player.levelUpsThisTurn===0&&canEvolveThisTurn,canAfford=player.energy+player.reserve>=cost;\n const heroCueItems:Array<{key:string,label:string,title:string,tone?:string}>=[];\n if(player.elementChain)heroCueItems.push({key:`legacy-element-${player.elementChain.element}`,label:`${player.elementChain.element} + ${player.elementChain.effect}`,title:`O próximo Feitiço de ${player.elementChain.element} aplica ${player.elementChain.effect} adicional.`,tone:"element"});\n for(const effect of player.nextElementEffects||[])heroCueItems.push({key:`element-${effect.element}-${effect.keyword}`,label:`${effect.element} + ${effect.keyword}`,title:`O próximo Feitiço de ${effect.element} aplica ${effect.keyword} adicional.`,tone:"element"});\n const authoritativeDiscount=(player.nextCardDiscounts||[]).reduce((best,item)=>Math.max(best,Number(item.amount||0)),0),legacyDiscount=Math.max(Number(player.nextCardDiscount||0),Number(player.nextNonCreatureDiscount||0),Number(player.nextSpellDiscount||0)),discount=Math.max(authoritativeDiscount,legacyDiscount);\n if(discount>0)heroCueItems.push({key:"cost-discount",label:`Custo -${discount}`,title:`A próxima carta aplicável custa ${discount} a menos.`,tone:"cost"});\n if(player.nextCreaturePaysLife||player.nextSummonPaysLife)heroCueItems.push({key:"life-cost",label:"Próxima criatura: Vida",title:"Sua próxima criatura aplicável pode usar Vida em vez de Energia.",tone:"life"});\n if(player.noReserveStorageThisTurn)heroCueItems.push({key:"reserve-lock",label:"Reserva bloqueada",title:"Você não pode armazenar energia na Reserva neste turno.",tone:"warning"});';
  source = replaceOnce(source, oldSetup, newSetup, "PlayerHero cue model");

  const oldCues = '  {player.elementChain&&<div className="hero-status-cues"><span title={`O próximo Feitiço de ${player.elementChain.element} aplica ${player.elementChain.effect} adicional.`}>{player.elementChain.element} +</span></div>}{(player.nextCardDiscount||player.nextNonCreatureDiscount||player.nextSpellDiscount)&&<div className="hero-status-cues cost"><span title="A próxima carta aplicável recebe redução de custo.">Custo ↓</span></div>}';
  const newCues = '  {!enemy&&<div className={`hero-status-cues local ${heroCueItems.length?"has-cues":"is-empty"}`} data-hero-status-cues="local" aria-label="Efeitos temporários do herói">{heroCueItems.length?heroCueItems.map(cue=><span key={cue.key} className={cue.tone?`cue-${cue.tone}`:undefined} title={cue.title}>{cue.label}</span>):<span className="cue-empty" title="Nenhum efeito temporário está ativo no momento.">Sem efeitos ativos</span>}</div>}{enemy&&heroCueItems.length>0&&<div className="hero-status-cues enemy-cues" data-hero-status-cues="enemy">{heroCueItems.map(cue=><span key={cue.key} title={cue.title}>{cue.label}</span>)}</div>}';
  source = replaceOnce(source, oldCues, newCues, "PlayerHero cue DOM");

  await writeFile(path, source);
}

{
  const cssPath = "app/ui-hero-status-v31.css";
  const css = `/* Hero status render v31 — keep the local cue in the same visible HUD column as EVOLUIR. */\n.screen-game .player-hero:not(.enemy){overflow:visible!important}\n.screen-game .player-hero:not(.enemy) .hero-status-cues.local{\n  left:116px!important;\n  right:auto!important;\n  top:116px!important;\n  bottom:auto!important;\n  width:128px!important;\n  transform:none!important;\n  display:flex!important;\n  flex-direction:column!important;\n  align-items:stretch!important;\n  gap:5px!important;\n  z-index:90!important;\n  visibility:visible!important;\n  opacity:1!important;\n  pointer-events:auto!important;\n  animation:none!important;\n}\n.screen-game .player-hero:not(.enemy) .hero-status-cues.local span{\n  min-width:0!important;\n  width:100%!important;\n  padding:6px 8px!important;\n  border:2px solid color-mix(in srgb,var(--deck,#69d5ff) 82%,white)!important;\n  border-radius:7px!important;\n  background:linear-gradient(135deg,color-mix(in srgb,var(--deck,#69d5ff) 40%,#08121d),#07101af5)!important;\n  color:#fff!important;\n  text-align:center!important;\n  font:900 9px/1.15 Arial,sans-serif!important;\n  letter-spacing:.055em!important;\n  text-transform:uppercase!important;\n  box-shadow:0 0 0 1px #ffffff20,0 0 16px color-mix(in srgb,var(--deck,#69d5ff) 58%,transparent),0 5px 12px #000c!important;\n  text-shadow:0 1px 3px #000!important;\n  cursor:help!important;\n}\n.screen-game .player-hero:not(.enemy) .hero-status-cues.local.has-cues span{animation:heroCueAttention 1.8s ease-in-out infinite}\n.screen-game .player-hero:not(.enemy) .hero-status-cues.local .cue-empty{opacity:.62!important;border-style:dashed!important;box-shadow:0 3px 10px #0008!important;animation:none!important;font-size:8px!important}\n.screen-game .player-hero:not(.enemy) .hero-status-cues.local .cue-life{border-color:#e75e6d!important;background:linear-gradient(135deg,#631621,#17090df5)!important}\n.screen-game .player-hero:not(.enemy) .hero-status-cues.local .cue-warning{border-color:#f2ba55!important;background:linear-gradient(135deg,#604216,#171006f5)!important}\n@keyframes heroCueAttention{0%,100%{filter:brightness(1)}50%{filter:brightness(1.22)}}\n@container hemsfell-board (max-height:44rem){.screen-game .player-hero:not(.enemy) .hero-status-cues.local{left:108px!important;top:108px!important;width:120px!important}.screen-game .player-hero:not(.enemy) .hero-status-cues.local span{padding:5px 6px!important;font-size:8px!important}}\n`;
  await writeFile(cssPath, css);

  const globalsPath = "app/globals.css";
  let globals = await read(globalsPath);
  const importLine = '@import "./ui-hero-status-v31.css";';
  if (!globals.includes(importLine)) {
    const imports = [...globals.matchAll(/^@import[^;]+;\n?/gm)];
    const insertAt = imports.length ? imports[imports.length - 1].index + imports[imports.length - 1][0].length : 0;
    globals = globals.slice(0, insertAt) + importLine + "\n" + globals.slice(insertAt);
  }
  await writeFile(globalsPath, globals);
}

console.log("v31 applied: local Hero Status Cues always render in DOM and include authoritative temporary effects.");
