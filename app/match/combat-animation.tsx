"use client";

import { RemoteCardArt } from "../presentation/cards/remote-card-art";

type CombatStage = "declared" | "priority" | "choosing" | "charging" | "impact" | "resolved";
type CombatCard = { page: number; name: string };
type CombatPresentation = {
  attackerOwner: 0 | 1;
  attackerCard: CombatCard;
  defenderCard?: CombatCard;
  targetHero?: boolean;
  stage: CombatStage;
  result?: string;
  destroyed?: string[];
  winnerText?: string;
  attackDamage?: number;
  counterDamage?: number;
};

export function CombatAnimation({action,attackerHero,defenderHero}:{action:CombatPresentation;attackerHero:string;defenderHero:string}){
 const title=action.stage==="declared"?"ATAQUE DECLARADO":action.stage==="priority"?"PRIORIDADE DE RESPOSTA":action.stage==="choosing"?"DECISÃO DO DEFENSOR":action.stage==="charging"?"ATAQUE EM CURSO":action.stage==="impact"?"IMPACTO":"COMBATE RESOLVIDO";
 const detail=action.stage==="declared"?`${action.attackerCard.name} declarou um ataque.`:action.stage==="priority"?"Antes da defesa, feitiços Acelerados e efeitos de resposta podem alterar o confronto.":action.stage==="choosing"?"O defensor pode bloquear com uma criatura válida ou receber o dano diretamente no herói.":action.stage==="charging"?`${action.attackerCard.name} avança contra ${action.targetHero?defenderHero:action.defenderCard?.name||"o defensor"}.`:action.stage==="impact"?"Ofensividade, Vitalidade e palavras-chave estão sendo resolvidas.":action.result||"O ataque foi concluído.";
 return <section className={`combat-cinematic owner-${action.attackerOwner} stage-${action.stage}`} aria-live="polite">
  <header><span>{title}</span><b>{action.attackerOwner===0?"SEU ATAQUE":"ATAQUE ADVERSÁRIO"}</b></header>
  <div className="combat-duel">
   <article className={`combatant combat-attacker ${action.destroyed?.includes("attacker")?"combat-destroyed":""}`}><RemoteCardArt page={action.attackerCard.page} name={action.attackerCard.name} priority/>{action.stage==="resolved"&&action.counterDamage!==undefined&&<em className="combat-damage">-{action.counterDamage}</em>}<p><small>{attackerHero}</small><b>{action.attackerCard.name}</b>{action.destroyed?.includes("attacker")&&<strong>AO CEMITÉRIO</strong>}</p></article>
   <div className="combat-track"><i></i><strong>⚔</strong><i></i></div>
   <article className={`combatant combat-defender ${action.destroyed?.includes("defender")?"combat-destroyed":""}`}>{action.defenderCard?<RemoteCardArt page={action.defenderCard.page} name={action.defenderCard.name} priority/>:<span>♛</span>}{action.stage==="resolved"&&action.attackDamage!==undefined&&<em className="combat-damage">-{action.attackDamage}</em>}<p><small>{defenderHero}</small><b>{action.defenderCard?.name||(action.targetHero?"Herói escolhido":"Aguardando escolha")}</b>{action.destroyed?.includes("defender")&&<strong>AO CEMITÉRIO</strong>}</p></article>
  </div>
  <footer>{action.winnerText&&<b>{action.winnerText}</b>}<span>{detail}</span></footer>
 </section>
}
