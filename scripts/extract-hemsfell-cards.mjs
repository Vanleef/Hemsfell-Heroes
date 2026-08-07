import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const pdf=process.argv[2];
const out=process.argv[3];
if(!pdf||!out) throw new Error("usage: node extract-hemsfell-cards.mjs <pdf> <out>");
const heroPages=new Set([2,26,54,110,129,152,180,211,255,273,291]);
const heroNames={2:"Gimble, Presenteado Sortudo",26:"Sr. Goblin, o Mercador de Bugigangas",54:"Uruk, a Encantriz da Evocação",110:"Tifon, a Peste",129:"Saymon, o Primeiro",152:"Tessália, a Mão de Ferro",180:"Quarion Siannodel",211:"Rasmus, o Barista do Tempo",255:"Ngoro, o Investigador",273:"Zayan, a Líder Revolucionária",291:"Campeão de Natureza"};
const cards=[];
for(let page=2;page<=309;page++){
  const raw=execFileSync("pdftotext",["-f",String(page),"-l",String(page),"-layout",pdf,"-"],{encoding:"utf8"}).replace(/\f/g,"");
  const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const hero=heroPages.has(page);
  const costMatch=lines[0]?.match(/^(\d+|X)$/i);
  const typeIdx=lines.findIndex(x=>/^\s*(?:\d+|X)?\s*(?:CRIATURA\s*(?:-|IMAGEM)|FEITIÇO(?:\s+ACELERADO)?(?:\s+IMAGEM)?$|ARTEFATO(?:\s+IMAGEM)?(?:\s+-.*)?$|ENCANTO(?:\s+IMAGEM)?(?:\s+-.*)?$|TERRENO CRUEL$|IMAGEM(?:\s+\d+\s+\d+.*)?$)/i.test(x));
  const title=hero?heroNames[page]:(lines.find((x,i)=>i<(typeIdx<0?5:typeIdx)&&!/^\d+$/.test(x)&&!/^X$/i.test(x))||`Carta ${page}`);
  const typeLine=typeIdx>=0?lines[typeIdx]:"HERÓI";
  const imageCard=/\bIMAGEM\b/i.test(typeLine);
  const type=/CRIATURA/i.test(typeLine)||/^IMAGEM\b/i.test(typeLine)?"Criatura":/FEITIÇO/i.test(typeLine)?"Feitiço":/ARTEFATO/i.test(typeLine)?"Artefato":/ENCANTO/i.test(typeLine)?"Encanto":/TERRENO/i.test(typeLine)?"Terreno":"Herói";
  const specialImageStats=typeLine.match(/^IMAGEM\s+(\d+|X)\s+(\d+|X)/i)||lines[typeIdx+1]?.match(/^\s*(\d+|X)\s+(\d+|X)\s*$/i);
  const leadingStat=typeLine.match(/^\s*(\d+|X)\s+CRIATURA/i)?.[1];
  const followingStat=typeLine.match(/\s(\d+|X)\s*$/i)?.[1]||lines[typeIdx+1]?.match(/^\s*(\d+|X)\s*$/i)?.[1];
  const atkRaw=specialImageStats?.[1]||leadingStat;
  const hpRaw=specialImageStats?.[2]||followingStat;
  const atk=type==="Criatura"?(atkRaw&&atkRaw!=="X"?Number(atkRaw):Math.max(1,Math.floor((Number(costMatch?.[1])||2)/2))):undefined;
  const hp=type==="Criatura"?(hpRaw&&hpRaw!=="X"?Number(hpRaw):Math.max(1,Number(costMatch?.[1])||2)):undefined;
  const body=lines.filter((x,i)=>i!==0&&x!==title&&i!==typeIdx&&!/^\d+$/.test(x)&&!/^X$/i.test(x)).join(" ");
  const tags=[...new Set(["Voar","Atropelar","Investida","Indomável","Furtivo","Veloz","Robusto","Roubo de Vida","Barreira Mágica","Indestrutível","Fura-fila","Primeiro Ato","Último Suspiro","Acelerado"].filter(k=>new RegExp(k,"i").test(body)))];
  cards.push({page,id:`p${page}`,name:title,type,cost:costMatch?Number(costMatch[1])||0:0,atk,hp,text:body,tags,image:`/cards/card-${String(page).padStart(3,"0")}.jpg`,hero,imageCard});
}
writeFileSync(out,JSON.stringify(cards,null,2)+"\n");
