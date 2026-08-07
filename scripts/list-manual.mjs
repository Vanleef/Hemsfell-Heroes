import fs from 'fs';
const cards = JSON.parse(fs.readFileSync(new URL('../app/cards.generated.json', import.meta.url)));
const keywords = ["Voar","Barreira Mágica","Atropelar","Investida","Indomável","Furtivo","Veloz","Robusto","Roubo de Vida","Toque da Morte","Indestrutível"];
const patterns = [
  /embaralhe|embaralhar/i,
  /compre\s+(\d+)/i,
  /(?:cure|restaure|recupere)\s+(\d+)/i,
  /cause\s+(\d+)\s+de dano/i,
  /(?:destrua|elimine|derrote) (?:uma|a|duas|até duas)?\s*criatura/i,
  /\bbana\b|\bbanir\b/i,
  /retorne .*criatura.*mão|devolva .*criatura.*mão/i,
  /(?:recebe|ganha|conceda)[^\d+]*\+?(\d+)?\s*\/\s*\+?(\d+)?/i,
  /(conceda|forneça|forneca|dê|recebe|ganha)/i,
  /receba\s+(\d+)\s+de energia/i,
  /próxim[ao]\s+carta[^.]*custa\s+(\d+)\s+a menos/i,
  /próxim[ao]\s+carta não-criatura[^.]*custa\s+(\d+)\s+a menos/i,
  /próxim[ao]\s+feitiço[^.]*custa\s+(\d+)\s+a menos/i,
  /triture\s+(\d+)/i,
  /investigue\s+(\d+)/i,
  /aplique\s+congelad|aplica\s+congelad/i,
  /aplique\s+atordoad|aplica\s+atordoad/i,
  /aplique\s+sufoc|aplica\s+sufoc/i,
  /aplique\s+imobiliz|aplica\s+imobiliz/i,
  /primeiro ato/i,
  /Fura-fila/i,
  /café|cafe/i
];

const unresolved = [];
for(const c of cards){
  const text = (c.text||'').toLowerCase();
  if(!text){ continue; }
  let resolved = false;
  for(const p of patterns){ if(p.test(text)){ resolved = true; break; } }
  // check keyword grants
  for(const kw of keywords){ if(new RegExp(kw,'i').test(text)){ resolved = true; break; } }
  // special pages handled in resolveText
  if([13,14,231,46].includes(c.page)) resolved = true;
  if(!resolved) unresolved.push({page:c.page, name:c.name, text:c.text.slice(0,200)});
}
fs.writeFileSync(new URL('../scripts/manual-cards.json', import.meta.url), JSON.stringify(unresolved,null,2));
console.log(`Found ${unresolved.length} potentially manual cards. Output: scripts/manual-cards.json`);
