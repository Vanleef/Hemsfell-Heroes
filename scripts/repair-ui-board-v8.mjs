import { readFile, writeFile } from "node:fs/promises";

const normalize = (value) => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const read = async (path) => normalize(await readFile(path, "utf8"));
const write = async (path, value) => writeFile(path, normalize(value));

// ---------------------------------------------------------------------------
// Hero command bar: the capsule itself is the interaction surface.
// No nested activation/use icon button remains.
// ---------------------------------------------------------------------------
{
  const path = "app/page.tsx";
  let source = await read(path);
  const start = source.indexOf("function HeroAbilities({player,enemy=false,onAbility}");
  const end = source.indexOf("\nfunction ResourceSummary", start);
  if (start < 0 || end < 0) throw new Error("Could not locate HeroAbilities boundaries.");

  const replacement = `function HeroAbilities({player,enemy=false,onAbility}:{player:Player;enemy?:boolean;onAbility?:(slot:number)=>void}){
 const d=deckById(player.heroId);
 return <aside className={\`hero-abilities hero-command-bar \${enemy?"enemy":""}\`} style={{"--deck":d.color} as React.CSSProperties} aria-label={\`Habilidades de \${heroDisplayName(player.heroId)}\`}>
  <header><b>Poderes</b><span>Nv. {player.level}</span></header>
  {d.abilities.map((ability,slot)=>{
   const active=isActiveAbility(d.id,slot),key=\`\${d.id}-\${slot}\`,locked=slot+1>player.level,used=!!player.abilityUses[key];
   const noResource=d.id==="saymon"&&(slot===0||slot===1)?player.life<=2:d.id==="ngoro"&&slot===1?player.heroXP<2:d.id==="ngoro"&&slot===2?player.heroXP<3:false;
   const noValidTarget=d.id==="gimble"&&slot===1?!player.board.some(card=>hasFaction(card,"Dragão")&&card.exhausted):false;
   const unavailable=enemy||locked||used||noResource||noValidTarget;
   const clickable=active&&!unavailable&&!enemy;
   const stateClass=locked?"is-locked":active?(clickable?"is-active is-available":"is-active is-unavailable"):"is-passive";
   const action=d.id==="saymon"?"Pagar 2 de vida":d.id==="ngoro"&&slot===1?"Gastar 2 Pistas":d.id==="ngoro"&&slot===2?"Gastar 3 Pistas":"Ativar";
   const title=locked?\`Habilidade liberada no nível \${slot+1}.\`:active?(used?"Habilidade já usada neste turno.":noResource?"Recursos insuficientes para usar esta habilidade.":noValidTarget?"Não há alvo válido para esta habilidade.":enemy?"Habilidade ativa do oponente.":\`\${action}: \${ability}\`):"Habilidade passiva; funciona automaticamente quando sua condição é cumprida.";
   return <button type="button" className={\`ability hero-ability-chip \${stateClass}\`} key={ability} disabled={!clickable} onClick={()=>{if(clickable)onAbility?.(slot)}} title={title} aria-label={\`\${active?"Ativa":"Passiva"}: \${ability}\`}><i aria-hidden="true">{slot+1}</i><span><b>{active?"ATIVA":"PASSIVA"}</b><p>{ability.replace(/^[IVX]+ · /,"")}</p></span></button>
  })}
 </aside>
}
`;

  source = source.slice(0, start) + replacement + source.slice(end);
  await write(path, source);
}

// ---------------------------------------------------------------------------
// CSS import persistence. v8 intentionally runs after v7 so it owns only the
// latest requested visual tuning without disturbing earlier responsive layers.
// ---------------------------------------------------------------------------
{
  const path = "app/lab.css";
  let source = await read(path);
  const importLine = '@import "./ui-board-polish-v8.css";';
  if (!source.includes(importLine)) {
    const preferredAnchor = '@import "./ui-gameplay-polish-v6.css";';
    source = source.includes(preferredAnchor)
      ? source.replace(preferredAnchor, `${preferredAnchor}\n${importLine}`)
      : `${importLine}\n${source}`;
    await write(path, source);
  }
}

console.log("Responsive hero command bar and board rail polish v8 applied.");
