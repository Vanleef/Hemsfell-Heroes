import { readFile, writeFile } from "node:fs/promises";

const normalize = (value) => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const patchFile = async (path, patch) => {
  const before = normalize(await readFile(path, "utf8"));
  const after = patch(before);
  if (after !== before) await writeFile(path, after);
};

const SEARCH_VERBS_PATTERN = "(?:procure|procurar|busque|buscar|busca)";

await patchFile("app/rules-engine/compiler.mjs", (source) => {
  const legacy = '  if (/procure|busque/.test(value)) { const amount=numberFrom(value.match(/(?:procure|busque)\\s+(\\d+|um|uma|dois|duas|tres)/)?.[1],1);';
  const canonical = `  if (/\\b${SEARCH_VERBS_PATTERN}\\b/.test(value)) { const amount=numberFrom(value.match(/${SEARCH_VERBS_PATTERN}(?:\\s+por)?\\s+(\\d+|um|uma|dois|duas|tres)/)?.[1],1);`;
  if (source.includes(legacy)) source = source.replace(legacy, canonical);
  else if (!source.includes(`/${SEARCH_VERBS_PATTERN}(?:\\s+por)?\\s+`)) {
    throw new Error("Deck-search parser patch point was not found in compiler.mjs");
  }
  return source;
});

await patchFile("app/page.tsx", (source) => {
  source = source.replace(
    'const isDeckSearch=(text:string)=>/(procure|procurar|busque|buscar)/i.test(text)&&/(deck|baralho)/i.test(text);',
    'const isDeckSearch=(text:string)=>/(procure|procurar|busque|buscar|busca)/i.test(text)&&/(deck|baralho)/i.test(text);'
  );
  source = source.replace(
    'explicit=text.match(/(?:procure|busque)(?:\\s+por)?\\s*(\\d+)/i)',
    'explicit=text.match(/(?:procure|procurar|busque|buscar|busca)(?:\\s+por)?\\s*(\\d+)/i)'
  );
  source = source.replace(
    'optional:/pode procurar/i.test(text)',
    'optional:/pode (?:procurar|buscar)/i.test(text)'
  );
  source = source.replace(
    '|Procure|Procurar|Busque|Buscar)/gi;',
    '|Procure|Procurar|Busque|Buscar|Busca)/gi;'
  );
  source = source.replace(
    '["procure","procurar","busque","buscar"].includes(normalized)?"Procure"',
    '["procure","procurar","busque","buscar","busca"].includes(normalized)?"Procure"'
  );
  return source;
});

console.log("Deck-search verbs normalized: Procure/Procurar/Busque/Buscar/Busca now share the same Procure semantics.");
