import fs from "node:fs";
import { execFileSync } from "node:child_process";

const command = process.argv[2];
const cardsUrl = new URL("../app/data/catalog/cards.generated.json", import.meta.url);
const manualCardsUrl = new URL("./manual-cards.json", import.meta.url);
const manualAnalysisUrl = new URL("./manual-analysis.json", import.meta.url);

const readJson = (url) => JSON.parse(fs.readFileSync(url, "utf8"));

function listManualCards() {
  const cards = readJson(cardsUrl);
  const keywords = ["Voar","Barreira Mágica","Atropelar","Investida","Indomável","Furtivo","Veloz","Robusto","Roubo de Vida","Toque da Morte","Indestrutível"];
  const patterns = [
    /embaralhe|embaralhar/i, /compre\s+(\d+)/i, /(?:cure|restaure|recupere)\s+(\d+)/i,
    /cause\s+(\d+)\s+de dano/i, /(?:destrua|elimine|derrote) (?:uma|a|duas|até duas)?\s*criatura/i,
    /\bbana\b|\bbanir\b/i, /retorne .*criatura.*mão|devolva .*criatura.*mão/i,
    /(?:recebe|ganha|conceda)[^\d+]*\+?(\d+)?\s*\/\s*\+?(\d+)?/i, /(conceda|forneça|forneca|dê|recebe|ganha)/i,
    /receba\s+(\d+)\s+de energia/i, /próxim[ao]\s+carta[^.]*custa\s+(\d+)\s+a menos/i,
    /próxim[ao]\s+carta não-criatura[^.]*custa\s+(\d+)\s+a menos/i, /próxim[ao]\s+feitiço[^.]*custa\s+(\d+)\s+a menos/i,
    /triture\s+(\d+)/i, /investigue\s+(\d+)/i, /aplique\s+congelad|aplica\s+congelad/i,
    /aplique\s+atordoad|aplica\s+atordoad/i, /aplique\s+sufoc|aplica\s+sufoc/i,
    /aplique\s+imobiliz|aplica\s+imobiliz/i, /primeiro ato/i, /Fura-fila/i, /café|cafe/i,
  ];
  const unresolved = [];
  for (const card of cards) {
    const text = (card.text || "").toLowerCase();
    if (!text) continue;
    let resolved = patterns.some((pattern) => pattern.test(text));
    if (!resolved) resolved = keywords.some((keyword) => new RegExp(keyword, "i").test(text));
    if ([13,14,231,46].includes(card.page)) resolved = true;
    if (!resolved) unresolved.push({ page: card.page, name: card.name, text: card.text.slice(0, 200) });
  }
  fs.writeFileSync(manualCardsUrl, JSON.stringify(unresolved, null, 2));
  console.log(`Found ${unresolved.length} potentially manual cards. Output: scripts/manual-cards.json`);
}

function analyzeManualCards() {
  const cards = readJson(manualCardsUrl);
  const patterns = [
    ["once-per-turn", /Uma vez por turno|Limite de 1 uso por turno/i], ["flip-destroy-artifact", /Vire: Destrua este artefato/i],
    ["create-image", /coloque .*imagem|invoque .*imagem|crie .*imagem/i], ["reserve", /energia reserva|reserva/i],
    ["elemental-first", /primeiro feitiço/i], ["graveyard", /cemitério|grave/i], ["last-breath", /Último Suspiro|Ultimo Suspiro/i],
    ["cost-equals", /custo.*igual/i], ["choose-target", /Escolha .*alvo|Escolha .*criatura|alvo/i], ["negate", /Anule/i],
    ["damage-event", /Cause dano igual|cause.*igual|quando.*morrer.*cause|cause.*dano.*igual/i], ["markers", /marcador|marcodores|marcadores/i],
    ["buff-eot", /Até o final do turno|Até o fim do turno/i], ["transform", /transforme uma criatura/i], ["attack-extra", /ataca 1 vez adicional/i],
    ["draw", /compre|comprar|compra|procure|procurar|busque|buscar/i], ["search-deck", /procure|procurar|busque|buscar/i],
    ["destroy-creature", /destrua .*criatura|destrua .*o artefato alvo|elimine .*criatura/i], ["ability-buff", /tem \+1 de Ofensividade|\+0\/+1|\+1\/\+1|ganha .*?de/i],
    ["target-based-damage", /a criatura.* causou dano|se .* causou dano/i],
  ];
  const counts = Object.fromEntries(patterns.map(([name]) => [name, 0]));
  for (const card of cards) for (const [name, pattern] of patterns) if (pattern.test(card.text)) counts[name]++;
  const byPattern = patterns.map(([name, pattern]) => ({ name, cards: cards.filter((card) => pattern.test(card.text)).map((card) => ({ page: card.page, name: card.name })) }));
  fs.writeFileSync(manualAnalysisUrl, JSON.stringify(byPattern, null, 2));
  console.log(JSON.stringify({ total: cards.length, counts }, null, 2));
  console.log("Wrote scripts/manual-analysis.json");
}

function extractCards() {
  const pdf = process.argv[3];
  const out = process.argv[4];
  if (!pdf || !out) throw new Error("usage: node scripts/card-tools.mjs extract <pdf> <out>");
  const heroPages = new Set([2,26,54,110,129,152,180,211,255,273,291]);
  const heroNames = {2:"Gimble, Presenteado Sortudo",26:"Sr. Goblin, o Mercador de Bugigangas",54:"Uruk, a Encantriz da Evocação",110:"Tifon, a Peste",129:"Saymon, o Primeiro",152:"Tessália, a Mão de Ferro",180:"Quarion Siannodel",211:"Rasmus, o Barista do Tempo",255:"Ngoro, o Investigador",273:"Zayan, a Líder Revolucionária",291:"Campeão de Natureza"};
  const cards = [];
  for (let page = 2; page <= 309; page++) {
    const raw = execFileSync("pdftotext", ["-f",String(page),"-l",String(page),"-layout",pdf,"-"], { encoding:"utf8" }).replace(/\f/g, "");
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const hero = heroPages.has(page);
    const costMatch = lines[0]?.match(/^(\d+|X)$/i);
    const typeIdx = lines.findIndex((line) => /^\s*(?:\d+|X)?\s*(?:CRIATURA\s*(?:-|IMAGEM)|FEITIÇO(?:\s+ACELERADO)?(?:\s+IMAGEM)?$|ARTEFATO(?:\s+IMAGEM)?(?:\s+-.*)?$|ENCANTO(?:\s+IMAGEM)?(?:\s+-.*)?$|TERRENO CRUEL$|IMAGEM(?:\s+\d+\s+\d+.*)?$)/i.test(line));
    const title = hero ? heroNames[page] : (lines.find((line, index) => index < (typeIdx < 0 ? 5 : typeIdx) && !/^\d+$/.test(line) && !/^X$/i.test(line)) || `Carta ${page}`);
    const typeLine = typeIdx >= 0 ? lines[typeIdx] : "HERÓI";
    const imageCard = /\bIMAGEM\b/i.test(typeLine);
    const type = /CRIATURA/i.test(typeLine) || /^IMAGEM\b/i.test(typeLine) ? "Criatura" : /FEITIÇO/i.test(typeLine) ? "Feitiço" : /ARTEFATO/i.test(typeLine) ? "Artefato" : /ENCANTO/i.test(typeLine) ? "Encanto" : /TERRENO/i.test(typeLine) ? "Terreno" : "Herói";
    const specialImageStats = typeLine.match(/^IMAGEM\s+(\d+|X)\s+(\d+|X)/i) || lines[typeIdx+1]?.match(/^\s*(\d+|X)\s+(\d+|X)\s*$/i);
    const leadingStat = typeLine.match(/^\s*(\d+|X)\s+CRIATURA/i)?.[1];
    const followingStat = typeLine.match(/\s(\d+|X)\s*$/i)?.[1] || lines[typeIdx+1]?.match(/^\s*(\d+|X)\s*$/i)?.[1];
    const atkRaw = specialImageStats?.[1] || leadingStat;
    const hpRaw = specialImageStats?.[2] || followingStat;
    const atk = type === "Criatura" ? (atkRaw && atkRaw !== "X" ? Number(atkRaw) : Math.max(1, Math.floor((Number(costMatch?.[1]) || 2) / 2))) : undefined;
    const hp = type === "Criatura" ? (hpRaw && hpRaw !== "X" ? Number(hpRaw) : Math.max(1, Number(costMatch?.[1]) || 2)) : undefined;
    const body = lines.filter((line, index) => index !== 0 && line !== title && index !== typeIdx && !/^\d+$/.test(line) && !/^X$/i.test(line)).join(" ");
    const tags = [...new Set(["Voar","Atropelar","Investida","Indomável","Furtivo","Veloz","Robusto","Roubo de Vida","Barreira Mágica","Indestrutível","Fura-fila","Primeiro Ato","Último Suspiro","Acelerado"].filter((keyword) => new RegExp(keyword,"i").test(body)))];
    cards.push({ page, id:`p${page}`, name:title, type, cost:costMatch ? Number(costMatch[1]) || 0 : 0, atk, hp, text:body, tags, image:`/cards/card-${String(page).padStart(3,"0")}.jpg`, hero, imageCard });
  }
  fs.writeFileSync(out, JSON.stringify(cards, null, 2) + "\n");
}

if (command === "manual-list") listManualCards();
else if (command === "manual-analyze") analyzeManualCards();
else if (command === "extract") extractCards();
else {
  console.log("Hemsfell card tools\n  manual-list      identify cards needing manual review\n  manual-analyze   categorize manual-review cards\n  extract <pdf> <out>  extract the catalog with pdftotext");
  if (command) process.exitCode = 1;
}
