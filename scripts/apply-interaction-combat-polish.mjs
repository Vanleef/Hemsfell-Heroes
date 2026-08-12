import { readFile, writeFile } from "node:fs/promises";

const patch = async (path, edits) => {
  let text = await readFile(path, "utf8");
  for (const [from, to, label] of edits) {
    if (!text.includes(from)) throw new Error(`Patch point not found (${label}) in ${path}`);
    text = text.replace(from, to);
  }
  await writeFile(path, text);
};

await patch("app/page.tsx", [
  [
    'type Unit=CardDef&{uid:string;slot:number;damage:number;bonusAtk:number;bonusHp:number;',
    'type Unit=CardDef&{uid:string;slot:number;enteredRound?:number;damage:number;bonusAtk:number;bonusHp:number;',
    "Unit enteredRound metadata",
  ],
  [
    '<section className="hs-board game-content">',
    '<section className={`hs-board game-content ${dragging?"is-dragging-card":""}`}>',
    "dragging board state",
  ],
  [
    '{unit&&<><span className={`live-atk ${modifiers.atk>0?"is-buffed":modifiers.atk<0||unit.frozen?"is-weakened":""}`}>{liveAttack}</span><span className={`live-hp ${modifiers.hp>0?"is-buffed":modifiers.hp<0?"is-weakened":""}`}>{liveVitality}</span>{unit.summoning&&<i className="summoning-sickness-badge" title="Enjoo de Invocação: não pode atacar neste turno.">ENJOO</i>}',
    '{unit&&<>{unit.type==="Criatura"&&<><span className={`live-atk ${modifiers.atk>0?"is-buffed":modifiers.atk<0||unit.frozen?"is-weakened":""}`}>{liveAttack}</span><span className={`live-hp ${modifiers.hp>0?"is-buffed":modifiers.hp<0?"is-weakened":""}`}>{liveVitality}</span></>}{unit.summoning&&<i className="summoning-sickness-badge" title={unit.type==="Artefato"?"Enjoo: este Artefato não pode ativar efeitos no turno em que entra em campo.":"Enjoo de Invocação: não pode atacar neste turno."}>ENJOO</i>}',
    "creature-only combat stats",
  ],
]);

await patch("app/rules-engine/engine.mjs", [
  [
    'summoning: card.type === "Criatura" && !(card.tags || []).some((tag) => /investida/i.test(String(tag)))',
    'summoning: card.type === "Artefato" || (card.type === "Criatura" && !(card.tags || []).some((tag) => /investida/i.test(String(tag))))',
    "artifact summoning sickness on play",
  ],
  [
    'if (!ability) throw new RulesViolation("ability-not-found"); if (!canExecuteCard(source, handlers))',
    'if (!ability) throw new RulesViolation("ability-not-found"); if (source.type === "Artefato" && (source.summoning || source.enteredRound === state.round)) throw new RulesViolation("summoning-sickness"); if (!canExecuteCard(source, handlers))',
    "authoritative artifact activation lock",
  ],
]);

console.log("Interaction/combat polish applied.");
