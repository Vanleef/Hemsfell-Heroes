import { readFile, writeFile } from "node:fs/promises";

const read = async (path) => (await readFile(path, "utf8")).replace(/\r\n/g, "\n");

// Keep the Commander cue in the same icon cluster used by summoning sickness/statuses.
{
  const path = "app/page.tsx";
  let source = await read(path);

  const oldStatuses = 'const negativeStatuses=unit?[unit.summoning?{key:"Enjoo",icon:"◷",tip:"Enjoo de invocação: esta carta não pode atacar nem usar efeitos ativáveis no turno em que entra em campo."}:null,unit.suffocated?{key:"Sufocado",icon:"⊘",tip:"Sufocado: efeitos e palavras-chave positivas desta carta ficam ignorados."}:null,unit.frozen?{key:"Congelado",icon:"❄",tip:"Congelado: a Ofensividade desta criatura fica 0 enquanto o efeito durar."}:null,unit.stunned?{key:"Atordoado",icon:"✹",tip:"Atordoado: esta criatura não pode atacar nem defender."}:null,unit.immobilized?{key:"Imobilizado",icon:"⌁",tip:"Imobilizado: esta criatura não desvira normalmente na próxima manutenção."}:null,(modifiers.atk<0||modifiers.hp<0)?{key:"Enfraquecido",icon:"↓",tip:"Enfraquecido: esta carta está sofrendo redução de atributos."}:null].filter((status):status is {key:string;icon:string;tip:string}=>!!status):[];';
  const newStatuses = 'const negativeStatuses=unit?[tessaliaCommander?{key:"Comandante",icon:"♛",tip:"Comandante: sua criatura central é o Comandante."}:null,unit.summoning?{key:"Enjoo",icon:"◷",tip:"Enjoo de invocação: esta carta não pode atacar nem usar efeitos ativáveis no turno em que entra em campo."}:null,unit.suffocated?{key:"Sufocado",icon:"⊘",tip:"Sufocado: efeitos e palavras-chave positivas desta carta ficam ignorados."}:null,unit.frozen?{key:"Congelado",icon:"❄",tip:"Congelado: a Ofensividade desta criatura fica 0 enquanto o efeito durar."}:null,unit.stunned?{key:"Atordoado",icon:"✹",tip:"Atordoado: esta criatura não pode atacar nem defender."}:null,unit.immobilized?{key:"Imobilizado",icon:"⌁",tip:"Imobilizado: esta criatura não desvira normalmente na próxima manutenção."}:null,(modifiers.atk<0||modifiers.hp<0)?{key:"Enfraquecido",icon:"↓",tip:"Enfraquecido: esta carta está sofrendo redução de atributos."}:null].filter((status):status is {key:string;icon:string;tip:string}=>!!status):[];';
  if (!source.includes(newStatuses)) {
    if (!source.includes(oldStatuses)) throw new Error("v28 Commander status cluster patch point not found");
    source = source.replace(oldStatuses, newStatuses);
  }

  // v27 used a separate floating crown. Remove it so only the shared status cluster remains.
  source = source.replace('{tessaliaCommander&&<i className="card-frame-commander" title="Comandante: sua criatura central é o Comandante." aria-label="Comandante: sua criatura central é o Comandante.">♛</i>}', '');
  await writeFile(path, source);
}

// Dedicated override. Do not alter the v18/v20 scripts or their stylesheets.
{
  const path = "app/ui-tessalia-commander-v28.css";
  const css = `/* Tessalia Commander v28 */
.screen-game .field-slot.creature-slot.commander-slot,
.hs-board .field-slot.creature-slot.commander-slot{
  border-color:#ff3e49!important;
  background:radial-gradient(circle at 50% 40%,rgba(190,25,38,.55),rgba(82,5,13,.82) 68%,rgba(34,3,8,.92))!important;
  box-shadow:inset 0 0 30px rgba(255,46,61,.42),0 0 14px rgba(220,28,43,.42)!important;
}
.screen-game .field-slot.creature-slot.commander-slot::before,
.hs-board .field-slot.creature-slot.commander-slot::before{
  content:none!important;
  display:none!important;
}
.screen-game .field-slot.creature-slot.commander-slot:has(.original-card),
.hs-board .field-slot.creature-slot.commander-slot:has(.original-card){
  border-color:#ff6068!important;
  box-shadow:inset 0 0 34px rgba(255,54,68,.48),0 0 18px rgba(225,31,47,.52)!important;
}
.field-negative-statuses i[data-status="Comandante"]{
  border-color:#ff6b72!important;
  background:radial-gradient(circle,#b32331,#4b0710)!important;
  color:#ffd9dc!important;
  box-shadow:0 0 8px rgba(255,48,62,.62)!important;
  cursor:help;
}
`;
  await writeFile(path, css);
}

// CSS @import rules must be before normal declarations. Previous migrations appended
// imports after the stylesheet body, which browsers may ignore. Normalize all imports.
{
  const path = "app/globals.css";
  let source = await read(path);
  const wanted = [
    '@import "tailwindcss";',
    '@import "./game.css";',
    '@import "./lab.css";',
    '@import "./ui-board-polish-v9.css";',
    '@import "./ui-board-polish-v10.css";',
    '@import "./ui-board-polish-v11.css";',
    '@import "./card-back.css";',
    '@import "./remote-card-art.css";',
    '@import "./ui-board-polish-v17.css";',
    '@import "./ui-readability-v18.css";',
    '@import "./ui-board-visual-polish-v20.css";',
    '@import "./arte-da-guerra-v24.css";',
    '@import "./ui-tessalia-runtime-v27.css";',
    '@import "./ui-tessalia-commander-v28.css";'
  ];
  source = source.replace(/^\s*@import\s+[^;]+;\s*/gm, "").replace(/^\s+/, "");
  source = wanted.join("\n") + "\n" + source;
  await writeFile(path, source);
}

console.log("v28 applied: Commander label removed, Tessalia center slot red, crown moved into the shared status icon cluster, CSS imports normalized.");
