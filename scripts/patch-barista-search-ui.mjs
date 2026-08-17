import fs from 'node:fs';

// One-shot canonical patch for the Barista Cat search UI.
const pagePath = 'app/page.tsx';
let page = fs.readFileSync(pagePath, 'utf8');

const typeNeedle = 'maxCostFromMarkerAmount?:boolean;markerCost?:number};context?';
if (!page.includes(typeNeedle)) throw new Error('PendingDecision effect type anchor not found');
page = page.replace(typeNeedle, 'maxCostFromMarkerAmount?:boolean;markerCost?:number;nameIncludes?:string};context?');

const oldFilter = '(!engineDecision.effect.maxCostFromMarkerAmount||card.cost<=Number(engineDecision.context?.markerAmount||0))';
if (!page.includes(oldFilter)) throw new Error('search decision filter anchor not found');
const newFilter = oldFilter + '&&(!engineDecision.effect.nameIncludes||String(card.name||"").toLocaleLowerCase("pt-BR").includes(String(engineDecision.effect.nameIncludes).toLocaleLowerCase("pt-BR")))';
page = page.replace(oldFilter, newFilter);

fs.writeFileSync(pagePath, page);
