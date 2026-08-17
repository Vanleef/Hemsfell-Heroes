"use client";

import { useEffect } from "react";

type HeroGuideData = {
  names: string[];
  faction: string;
  color: string;
  requirement: [number, number];
  criterion: string;
  milestone: (target: number) => string;
  abilities: Array<{ active: boolean; text: string }>;
};

const heroes: HeroGuideData[] = [
  { names:["Gimble, Presenteado Sortudo","Gimble"], faction:"Natureza", color:"#2d9a58", requirement:[2,4], criterion:"Controle simultaneamente a quantidade indicada de Dragões.", milestone:n=>`Controle ${n} Dragões simultaneamente no campo.`, abilities:[{active:false,text:"Quando um Dragão deixa o campo, cure 1."},{active:true,text:"Uma vez por turno, desvire um Dragão aliado."},{active:false,text:"Na manutenção, seus Dragões recebem +1/+1."}] },
  { names:["Sr. Goblin, o Mercador","Sr. Goblin","Sr Goblin"], faction:"Caos", color:"#8d45ce", requirement:[3,5], criterion:"Jogue a quantidade indicada de cartas no mesmo turno; o progresso reinicia no próximo turno.", milestone:n=>`Jogue ${n} cartas durante o mesmo turno.`, abilities:[{active:false,text:"Ao perder um Goblin, compre 1 carta (uma vez por turno)."},{active:false,text:"Compre 1 carta adicional na manutenção."},{active:false,text:"O primeiro Goblin do turno custa 0."}] },
  { names:["Uruk, a Encantriz","Uruk"], faction:"Divino", color:"#378ed0", requirement:[4,8], criterion:"Conjure a quantidade indicada de feitiços ao longo da partida.", milestone:n=>`Conjure ${n} feitiços ao longo da partida.`, abilities:[{active:false,text:"Fim do turno: ative o elemento do último feitiço."},{active:false,text:"Seu primeiro feitiço custa 1 a menos."},{active:false,text:"Duplique o último feitiço do seu turno."}] },
  { names:["Tifon, a Peste","Tifon"], faction:"Neutro", color:"#777d86", requirement:[3,7], criterion:"Registre a quantidade indicada de mortes de criaturas aliadas.", milestone:n=>`Registre ${n} mortes de criaturas aliadas.`, abilities:[{active:false,text:"Quando uma criatura sua morrer, compre 1 carta (máx. 3)."},{active:false,text:"Último Suspiro aliado causa 1 ao herói inimigo."},{active:false,text:"Seus Últimos Suspiros são ativados duas vezes."}] },
  { names:["Saymon, o Primeiro","Saymon"], faction:"Neutro", color:"#777d86", requirement:[3,5], criterion:"Acumule a quantidade indicada de eventos de perda de vida no turno atual.", milestone:n=>`Acumule ${n} eventos de perda de vida no mesmo turno.`, abilities:[{active:true,text:"Pague 2 de vida: cause 1 a um alvo (uma vez por turno)."},{active:true,text:"Pague 2 de vida: dê Roubo de Vida a uma criatura."},{active:false,text:"Custos de vida não podem reduzir sua vida abaixo de 1."}] },
  { names:["Tessália, a Mão de Ferro","Tessália"], faction:"Ordem", color:"#d54a45", requirement:[3,6], criterion:"Declare a quantidade indicada de ataques com a criatura Comandante central.", milestone:n=>`Declare ${n} ataques com a criatura Comandante central.`, abilities:[{active:false,text:"Seu Comandante tem +2 de Ofensividade e sem ele você não pode atacar."},{active:false,text:"Seu Comandante tem Atropelar e recebe +3."},{active:false,text:"Uma vez por turno, outra criatura pode morrer pelo Comandante."}] },
  { names:["Quarion Siannodel","Quarion"], faction:"Ordem", color:"#c84642", requirement:[2,4], criterion:"Controle a quantidade indicada de criaturas de nomes diferentes com Primeiro Ato.", milestone:n=>`Controle ${n} criaturas de nomes diferentes com Primeiro Ato.`, abilities:[{active:false,text:"Ao ativar Primeiro Ato, compre 1 carta (uma vez por turno)."},{active:false,text:"A primeira criatura que morrer no seu turno volta à mão."},{active:false,text:"O primeiro Primeiro Ato do turno é ativado novamente."}] },
  { names:["Rasmus, o Barista do Tempo","Rasmus"], faction:"Divino", color:"#378ed0", requirement:[5,7], criterion:"Controle simultaneamente a quantidade indicada de Gatos considerando ambos os campos.", milestone:n=>`Existam ${n} Gatos simultaneamente somando os dois campos.`, abilities:[{active:false,text:"Após 10 Cafés, crie um Café Especial."},{active:false,text:"Quando um Gato causar dano a um jogador, cure 1."},{active:false,text:"Gatos também podem ocupar espaços de não-criaturas."}] },
  { names:["Ngoro, o Investigador","Ngoro"], faction:"Caos", color:"#7949b5", requirement:[5,10], criterion:"Acumule a quantidade indicada de Pistas disponíveis.", milestone:n=>`Acumule ${n} Pistas disponíveis.`, abilities:[{active:false,text:"Ao Investigar, ganhe 1 Pista; no início, Investigue 1."},{active:true,text:"Gaste 2 Pistas: compre 1 ou triture 2."},{active:true,text:"Gaste 3 Pistas: dê Furtivo a uma criatura aliada."}] },
  { names:["Zayan, a Revolucionária","Zayan"], faction:"Ordem", color:"#cf4c45", requirement:[3,4], criterion:"Controle a quantidade indicada de constantes sem texto de efeito.", milestone:n=>`Controle ${n} constantes sem texto de efeito.`, abilities:[{active:false,text:"No combate, uma criatura sem efeito recebe +1/+1."},{active:false,text:"Outra criatura pode ser destruída no lugar de uma sem efeito."},{active:false,text:"Criaturas sem efeito recebem Investida."}] },
  { names:["Campeão de Natureza"], faction:"Natureza", color:"#289455", requirement:[10,20], criterion:"Acumule a quantidade indicada de marcadores de ação em suas constantes.", milestone:n=>`Acumule ${n} marcadores de ação em suas constantes.`, abilities:[{active:true,text:"Uma vez por turno, dê 2 marcadores a até duas constantes."},{active:false,text:"Ao colocar marcadores, coloque um adicional."},{active:true,text:"Remova 4 marcadores: vire uma criatura alvo."}] },
];

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]!));

function renderGuide(hero:HeroGuideData, canonicalName:string){
  const abilities=hero.abilities.map((ability,index)=>`<article><span>${index+1}</span><div><p><em class="${ability.active?"active":"passive"}">${ability.active?"Ativa":"Passiva"}</em><span>${escapeHtml(ability.text)}</span></p></div></article>`).join("");
  const milestones=hero.requirement.map((target,index)=>`<li><span>NÍVEL ${index+2}</span><b>${escapeHtml(hero.milestone(target))}</b></li>`).join("");
  return `<div class="inspector-hero-guide canonical-runtime-guide" style="--deck:${hero.color}"><section class="hero-guide" style="--deck:${hero.color}"><header><span>GUIA DO HERÓI</span><h3>${escapeHtml(canonicalName)}</h3><p>${escapeHtml(hero.faction)}</p></header><section class="hero-evolution-guide"><div class="hero-guide-title"><i>✦</i><span><small>CONDIÇÃO DE EVOLUÇÃO</small><b>Como subir de nível</b></span></div><p>${escapeHtml(hero.criterion)}</p><ol>${milestones}</ol></section><section class="hero-abilities-guide"><div class="hero-guide-title"><i>◆</i><span><small>HABILIDADES</small><b>Poderes liberados por nível</b></span></div><div>${abilities}</div></section></section></div>`;
}

export default function HeroInspectorCanonicalizer(){
  useEffect(()=>{
    const canonicalize=()=>{
      document.querySelectorAll<HTMLElement>(".card-focus-layer.inspector").forEach(dialog=>{
        const label=dialog.getAttribute("aria-label")||"";
        const hero=heroes.find(candidate=>candidate.names.some(name=>label.toLocaleLowerCase("pt-BR").includes(name.toLocaleLowerCase("pt-BR"))));
        if(!hero)return;
        const aside=dialog.querySelector<HTMLElement>("aside");
        if(!aside||aside.querySelector(".canonical-runtime-guide"))return;
        const canonicalName=hero.names[0];
        aside.innerHTML=renderGuide(hero,canonicalName);
      });
    };
    canonicalize();
    const observer=new MutationObserver(canonicalize);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);
  return null;
}
