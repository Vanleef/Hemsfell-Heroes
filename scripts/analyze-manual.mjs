import fs from 'fs';
const cards = JSON.parse(fs.readFileSync(new URL('./manual-cards.json', import.meta.url), 'utf8'));
const patterns = [
  ['once-per-turn', /Uma vez por turno|Limite de 1 uso por turno/i],
  ['flip-destroy-artifact', /Vire: Destrua este artefato/i],
  ['create-image', /coloque .*imagem|invoque .*imagem|crie .*imagem|invoque .*imagem/i],
  ['reserve', /energia reserva|reserva/i],
  ['elemental-first', /primeiro feitiço|Primeiro feitiço/i],
  ['graveyard', /cemitério|grave/i],
  ['last-breath', /Último Suspiro|Ultimo Suspiro/i],
  ['cost-equals', /custo.*igual/i],
  ['choose-target', /Escolha .*alvo|Escolha .*criatura|alvo/i],
  ['negate', /Anule/i],
  ['damage-event', /Cause dano igual|cause.*igual|quando.*morrer.*cause|cause.*dano.*igual/i],
  ['markers', /marcador|marcodores|marcadores/i],
  ['buff-eot', /Até o final do turno|Até o fim do turno/i],
  ['transform', /transforme uma criatura/i],
  ['attack-extra', /ataca 1 vez adicional/i],
  ['draw', /compre|comprar|compra|procure|procurar|busque|buscar/i],
  ['search-deck', /procure|procurar|busque|buscar/i],
  ['destroy-creature', /destrua .*criatura|destrua .*o artefato alvo|elimine .*criatura/i],
  ['ability-buff', /tem \+1 de Ofensividade|\+0\/+1|\+1\/\+1|ganha .*?de/i],
  ['target-based-damage', /a criatura.* causou dano|se .* causou dano/i],
];
const counts = {};
for (const [name] of patterns) counts[name] = 0;
for (const card of cards) {
  for (const [name, re] of patterns) {
    if (re.test(card.text)) counts[name]++;
  }
}
console.log(JSON.stringify({total: cards.length, counts}, null, 2));
const byPattern = patterns.map(([name, re]) => ({name, cards: cards.filter(c => re.test(c.text)).map(c => ({page: c.page, name: c.name}))}));
fs.writeFileSync(new URL('./manual-analysis.json', import.meta.url), JSON.stringify(byPattern, null, 2));
console.log('Wrote scripts/manual-analysis.json');
