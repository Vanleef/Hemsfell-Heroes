"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import rawCards from "./data/catalog/generated-card-catalog";
import type { CardDef, CardType, CombatAction, ElementName, GameState as Game, MatchSettings, OnlineSession, PendingDecision, PendingResponse, Phase, PlayerState as Player, Unit } from "./model/game-state";
import { preloadMatchCardArt, RemoteCardArt } from "./presentation/cards/remote-card-art";
import { canActivateCard, hasActivatableEffect } from "./rules-engine/cards/card-activation.mjs";
import { compileCard } from "./rules-engine/compiler.mjs";
import { hasIntrinsicKeyword, intrinsicKeywordNames } from "./rules-engine/cards/card-keywords.mjs";
import { canExecuteCard, executeCommand } from "./application/commands/game-command-service.mjs";
import { legalPriorityResponses } from "./rules-engine/priority.mjs";
import { orderAIAttackers } from "./rules-engine/ai.mjs";
import { hasSubtype } from "./rules-engine/subtypes.mjs";
import { cardPlayTargetPolicy, isValidTarget, targetPolicy, TargetScope } from "./rules-engine/targeting.mjs";
import { applyCloneRetaliation, claimOncePerTurn, earthquakeDamage, elementalChainFrom as ruleElementalChainFrom } from "./rules-engine/game-rules.mjs";
import { clearOnlineSession, loadOnlineSession, saveOnlineSession } from "./application/session/online-session.mjs";
import { MAIN_DECK_SIZE, defaultUserDeck, disabledDeckCardIds as sharedDisabledDeckCardIds, expandUserDeckMain, removedCatalogPages as sharedRemovedCatalogPages, resolveUserDeckExtra, suppliedDeckPages as sharedSuppliedDeckPages, validateUserDeck } from "./model/decks/user-deck.mjs";
import type { UserDeck } from "./model/decks/user-deck.mjs";
import { CombatAnimation } from "./match/combat-animation";
import { PriorityControlToggle, ResponseModal } from "./match/priority-ui";
import { usePriorityControl } from "./match/use-priority-control";
import { MatchResultOverlay } from "./presentation/match/match-result-overlay";
import { DeadlineText, MatchTurnClock, useDeadlineSeconds } from "./presentation/runtime/deadline-clock";

const TutorialScreen = dynamic(
  () => import("./presentation/tutorial").then((module) => module.TutorialScreen),
  { ssr: false },
);

type AdvancedAIRuntime = typeof import("./rules-engine/ai-system/runtime");
let advancedAIRuntimePromise: Promise<AdvancedAIRuntime> | null = null;
const loadAdvancedAIRuntime = () => {
  advancedAIRuntimePromise ??= Promise.all([
    import("./application/ai/browser-ai-worker"),
    import("./rules-engine/ai-system/runtime"),
  ]).then(([, runtime]) => runtime).catch((error) => {
    advancedAIRuntimePromise = null;
    throw error;
  });
  return advancedAIRuntimePromise;
};

const immediateCardEffectText=(card:CardDef)=>card.text.split(/neste turno,\s*seu próximo/i)[0];
const cardPlayEffectText=(card:CardDef)=>card.type!=="Criatura"?immediateCardEffectText(card):card.text.match(/primeiro ato\s*:\s*([\s\S]*?)(?=(?:último suspiro|fura-fila)\s*:|$)/i)?.[1]?.trim()||"";
/* Heroes are valid targets only for explicit damage or healing effects. */
const allowsHeroTarget=(card:CardDef|undefined,step=0)=>!!card&&(targetPolicy({...card,text:cardPlayEffectText(card)}).steps?.[step]?.scope??targetPolicy({...card,text:cardPlayEffectText(card)}).scope)===TargetScope.ANY_CHARACTER;
type Screen="menu"|"setup"|"decks"|"tutorial"|"game";
type Targeting={kind:"attach"|"spell"|"elemental-optional"|"gimble"|"natureza"|"saymon"|"saymon-life"|"ngoro"|"uruk-fire"|"tranqueira-attach";source:string;cardIndex?:number;amount?:number;response?:boolean;fieldSlot?:number;required?:number;minimum?:number;selected?:string[];chosenElement?:ElementName;sourceUid?:string;allowedIds?:string[]};
type ImageChoice={cardIndex:number;cardName:string;options:string[];fieldSlot?:number};
type CafeChoice="cats"|"heal"|"draw"|"level";
type VisualFx={id:string;kind:"summon"|"spell"|"artifact"|"terrain"|"ability"|"damage";theme:"blood"|"dragon"|"goblin"|"recruit"|"divine"|"nature"|"arcane"|"chaos"|"order"|"neutral";card?:CardDef;target?:CardDef;label:string;detail:string};
type SearchRequest={id:string;owner:0|1;sourceName:string;sourcePage:number;text:string;limit:number;filterLabel:string;destination:"hand"|"field";reveal:boolean;optional:boolean;maxCost?:number};

const removedCatalogPages=sharedRemovedCatalogPages;
const cards=(rawCards as CardDef[]).filter(card=>!removedCatalogPages.has(card.page)).map(card=>compileCard(card.page===252?{...card,type:"Feitiço",tags:[...new Set([...(card.tags||[]),"Acelerado"])]}:card) as CardDef);
type CardFaction="Dragão"|"Goblin"|"Gato"|"Vampiro"|"Recruta"|"Fênix";
/* Subtypes are compiled card data and may contain more than one value. */
const hasFaction=(card:Pick<CardDef,"page"|"subtypes">|undefined,faction:CardFaction)=>!!card&&hasSubtype(card,faction);
const deckDefs=[
 {id:"gimble",heroPage:2,start:3,end:25,name:"Gimble, Presenteado Sortudo",faction:"Natureza",color:"#2d9a58",style:"Dragões · crescimento",power:"Desvire um Dragão aliado",requirement:"2/4 Dragões",abilities:["I · Quando um Dragão deixa o campo, cure 1.","II · Uma vez por turno, desvire um Dragão aliado.","III · Na manutenção, seus Dragões recebem +1/+1."]},
 {id:"goblin",heroPage:26,start:27,end:49,name:"Sr. Goblin, o Mercador",faction:"Caos",color:"#8d45ce",style:"Goblin · Fura-Fila",power:"Compre ao perder um Goblin",requirement:"3/5 cartas no turno",abilities:["I · Ao perder um Goblin, compre 1 (uma vez/turno).","II · Compre 1 carta adicional na manutenção.","III · O primeiro Goblin do turno custa 0."]},
 {id:"uruk",heroPage:54,start:55,end:109,name:"Uruk, a Encantriz",faction:"Divino",color:"#378ed0",style:"Elementos · feitiços",power:"Ative o último elemento",requirement:"4/8 feitiços",abilities:["I · Fim do turno: ative o elemento do último feitiço.","II · Seu primeiro feitiço custa 1 a menos.","III · Duplique o último feitiço do seu turno."]},
 {id:"tifon",heroPage:110,start:111,end:128,name:"Tifon, a Peste",faction:"Neutro",color:"#777d86",style:"Último Suspiro",power:"Compre quando um aliado morrer",requirement:"3/7 mortes",abilities:["I · Quando uma criatura sua morrer, compre 1 (máx. 3).","II · Último Suspiro aliado causa 1 ao herói inimigo.","III · Seus Últimos Suspiros são ativados duas vezes."]},
 {id:"saymon",heroPage:129,start:130,end:151,name:"Saymon, o Primeiro",faction:"Neutro",color:"#777d86",style:"Vampiros · Roubo de Vida",power:"Perca 2: cause 1",requirement:"3/5 perdas de vida",abilities:["I · Pague 2 de vida: cause 1 a um alvo (uma vez/turno).","II · Pague 2 de vida: dê Roubo de Vida a uma criatura.","III · Custos de vida não podem reduzir sua vida abaixo de 1."]},
 {id:"tessalia",heroPage:152,start:153,end:179,name:"Tessália, a Mão de Ferro",faction:"Ordem",color:"#d54a45",style:"Comandante · formação",power:"Fortaleça o centro",requirement:"3/6 ataques",abilities:["I · Seu Comandante tem +2 de Ofensividade e sem ele, você não pode atacar.","II · Seu Comandante tem Atropelar e recebe +3.","III · Uma vez/turno, outra criatura pode morrer pelo Comandante."]},
 {id:"quarion",heroPage:180,start:181,end:210,name:"Quarion Siannodel",faction:"Ordem",color:"#c84642",style:"Primeiro Ato · valor",power:"Recupere a primeira criatura",requirement:"2/4 nomes diferentes",abilities:["I · Ao ativar Primeiro Ato, compre 1 (uma vez/turno).","II · A primeira criatura que morrer no seu turno volta à mão.","III · O primeiro Primeiro Ato do turno é ativado novamente."]},
 {id:"rasmus",heroPage:211,start:212,end:254,name:"Rasmus, o Barista do Tempo",faction:"Divino",color:"#378ed0",style:"Gatos · Café",power:"Cure ao causar dano",requirement:"5/7 Gatos",abilities:["I · Após 10 Cafés, crie um Café Especial.","II · Quando um Gato causar dano a um jogador, cure 1.","III · Gatos também podem ocupar espaços de não-criaturas."]},
 {id:"ngoro",heroPage:255,start:256,end:272,name:"Ngoro, o Investigador",faction:"Caos",color:"#7949b5",style:"Investigar · Triturar",power:"Investigue o deck alvo",requirement:"5/10 Pistas",abilities:["I · Ao Investigar, ganhe 1 Pista; no início, Investigue 1.","II · Gaste 2 Pistas: compre 1 ou triture 2.","III · Gaste 3 Pistas: dê Furtivo a uma criatura aliada."]},
 {id:"zayan",heroPage:273,start:274,end:290,name:"Zayan, a Revolucionária",faction:"Ordem",color:"#cf4c45",style:"Criaturas sem efeito",power:"Fortaleça uma criatura",requirement:"3/4 constantes",abilities:["I · No combate, uma criatura sem efeito recebe +1/+1.","II · Outra criatura pode ser destruída no lugar de uma sem efeito.","III · Criaturas sem efeito recebem Investida."]},
 {id:"natureza",heroPage:291,start:292,end:309,name:"Campeão de Natureza",faction:"Natureza",color:"#289455",style:"Marcadores de ação",power:"Distribua marcadores",requirement:"10/20 marcadores",abilities:["I · Uma vez/turno, dê 2 marcadores a até duas constantes.","II · Ao colocar marcadores, coloque um adicional.","III · Remova 4 marcadores: vire uma criatura alvo."]},
] as const;
type DeckId=typeof deckDefs[number]["id"];
type DeckDef=typeof deckDefs[number];
const heroPortraitSources:Record<DeckId,{src:string;position:string}>={
 gimble:{src:"/heroes/gimble.webp",position:"58% 18%"},
 goblin:{src:"/heroes/goblin.webp",position:"50% 19%"},
 uruk:{src:"/heroes/uruk.webp",position:"50% 20%"},
 tifon:{src:"/heroes/tifon.webp",position:"50% 22%"},
 saymon:{src:"/heroes/saymon.webp",position:"50% 18%"},
 tessalia:{src:"/heroes/tessalia.webp",position:"57% 18%"},
 quarion:{src:"/heroes/quarion.webp",position:"50% 18%"},
 rasmus:{src:"/heroes/rasmus.webp",position:"57% 17%"},
 ngoro:{src:"/heroes/ngoro.webp",position:"50% 17%"},
 zayan:{src:"/heroes/zayan.webp",position:"50% 19%"},
 natureza:{src:"/heroes/natureza.webp",position:"58% 20%"},
};
const deckById=(id:string)=>deckDefs.find(d=>d.id===id)!;
const deckByHeroPage=(page:number)=>deckDefs.find(d=>d.heroPage===page);
const heroDisplayName=(id:string)=>({gimble:"Gimble",goblin:"Sr Goblin",uruk:"Uruk",tifon:"Tifon",saymon:"Saymon",tessalia:"Tessália",quarion:"Quarion",rasmus:"Rasmus",ngoro:"Ngoro",zayan:"Zayan",natureza:"Campeão de Natureza"}[id]??deckById(id).name.split(",")[0]);
const evolutionHint=(id:string,level:number)=>{const hints:Record<string,string[]>={gimble:["Reúna Dragões e faça a ninhada crescer","Alcance a marca de 2 Dragões em jogo","Domine 4 Dragões para o ápice"],goblin:["Jogue cartas em sequência para alimentar o mercado","Atinja 3 cartas jogadas no mesmo turno","Complete 5 cartas no turno para a evolução final"],uruk:["Conjure feitiços para carregar os elementos","Conjure 4 feitiços e canalize o próximo elemento","Conjure 8 feitiços para dominar os elementos"],tifon:["Veja aliados tombarem e transforme perdas em vantagem","Registre 3 mortes aliadas","Registre 7 mortes para liberar o Último Suspiro"],saymon:["Perca vida em eventos distintos neste turno","Acumule 3 marcadores temporários neste turno","Acumule 5 marcadores temporários neste turno"]};return hints[id]?.[Math.min(2,Math.max(0,level-1))]??"Cumpra o marco exibido para liberar o próximo poder"};
/* Interpreted summaries keep the evolution tooltip concise and readable. */
const evolutionCriterionSummary=(id:string)=>({gimble:"Controle simultaneamente a quantidade indicada de Dragões.",goblin:"Jogue a quantidade indicada de cartas no mesmo turno; o progresso reinicia no próximo.",uruk:"Conjure feitiços ao longo da partida para dominar os elementos.",tifon:"Acumule mortes de criaturas aliadas ao longo da partida.",saymon:"Cada evento de perda de vida concede 1 marcador até o fim do turno; o progresso reinicia no próximo.",tessalia:"Declare ataques com a criatura no espaço central, seu Comandante.",quarion:"Controle simultaneamente criaturas com nomes diferentes e Primeiro Ato.",rasmus:"Controle simultaneamente a quantidade indicada de Gatos.",ngoro:"Acumule Pistas por meio de Investigar; Pistas gastas deixam de contar.",zayan:"Controle simultaneamente constantes sem texto de efeito.",natureza:"Acumule marcadores de ação nas suas constantes."}[id]??"Cumpra o objetivo do herói para liberar o próximo nível.");
/* Listas de teste fornecidas pelo autor. O número é a página/arte canônica do catálogo,
   portanto a composição e a ilustração deixam de depender de intervalos aproximados. */
const suppliedDeckPages=sharedSuppliedDeckPages as Partial<Record<DeckId,Array<[number,number]>>>;
/* Cartas complexas ainda não liberadas não entram em nenhum deck jogável. */
const disabledDeckCardIds=sharedDisabledDeckCardIds;
const allFor=(id:string)=>{const d=deckById(id);return cards.filter(c=>c.page>=d.start&&c.page<=d.end&&!c.hero)};
const poolFor=(id:string)=>{const supplied=suppliedDeckPages[id as DeckId];return supplied?supplied.map(([page])=>cards.find(card=>card.page===page)).filter((card):card is CardDef=>!!card&&!card.imageCard&&!disabledDeckCardIds.has(card.id)):allFor(id).filter(c=>!c.imageCard&&!disabledDeckCardIds.has(c.id))};
const collectionFor=(id:string)=>{const supplied=suppliedDeckPages[id as DeckId];if(supplied)return supplied.map(([page,quantity])=>({card:cards.find(candidate=>candidate.page===page),quantity})).filter((entry):entry is {card:CardDef;quantity:number}=>!!entry.card&&!entry.card.imageCard&&!disabledDeckCardIds.has(entry.card.id));const pool=poolFor(id),base=Math.floor(49/Math.max(1,pool.length)),remainder=49%Math.max(1,pool.length);return pool.map((card,index)=>({card,quantity:base+(index<remainder?1:0)}))};
const extraFor=(id:string)=>allFor(id).filter(c=>c.imageCard&&!disabledDeckCardIds.has(c.id)&&(id!=="uruk"||[71,72,73,74,81].includes(c.page)));
const buildDeck=(id:string,userDeck?:UserDeck|null)=>{if(userDeck){const validation=validateUserDeck(userDeck,cards);if(validation.ok&&validation.deck&&validation.deck.heroId===id)return expandUserDeckMain(validation.deck,cards,(cardId,copy)=>`${cardId}-${id}-${copy}-${uid()}`) as CardDef[]}const supplied=suppliedDeckPages[id as DeckId];if(supplied)return supplied.flatMap(([page,quantity])=>{const card=cards.find(candidate=>candidate.page===page);return card&&!disabledDeckCardIds.has(card.id)?Array.from({length:quantity},(_,copy)=>({...card,id:`${card.id}-${id}-${copy}-${uid()}`})):[]});const pool=poolFor(id),out:CardDef[]=[];let copy=0;while(out.length<49){for(const c of pool){if(out.length===49)break;out.push({...c,id:`${c.id}-${copy}`})}copy++}return out};
const shuffle=<T,>(source:T[])=>{const a=[...source];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
let idSequence=0;const uid=()=>globalThis.crypto?.randomUUID?.()??`hh-${Date.now().toString(36)}-${(++idSequence).toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const MAX_LIVE_LOG_ENTRIES=200;
const log=(g:Game,text:string,tone="")=>{g.log.unshift({id:uid(),text,tone});if(g.log.length>MAX_LIVE_LOG_ENTRIES)g.log.length=MAX_LIVE_LOG_ENTRIES;g.events++};
const makePlayer=(heroId:string,startingLife=30,userDeck?:UserDeck|null):Player=>{const validation=userDeck?validateUserDeck(userDeck,cards):null,configuredDeck=validation?.ok&&validation.deck?.heroId===heroId?validation.deck:null,deck=shuffle(buildDeck(heroId,configuredDeck));return{heroId,level:1,heroXP:0,levelUpsThisTurn:0,life:startingLife,lifeLostThisTurn:0,lifeLossEvents:0,maxEnergy:0,energy:0,reserve:0,deck:deck.slice(7),extraDeck:configuredDeck?resolveUserDeckExtra(configuredDeck,cards) as CardDef[]:extraFor(heroId),hand:deck.slice(0,7),board:[],support:[],terrain:null,grave:[],obscuro:[],cardsPlayed:0,turnCardsPlayed:0,goblinTurnCardsPlayed:0,turnSpellsPlayed:0,spellsPlayed:0,coffeeSpells:0,damageDealt:0,turnDeaths:0,abilityUses:{},pendingTranqueira:false,nextCardDiscount:0,nextNonCreatureDiscount:0,nextSpellDiscount:0,nextSummonPaysLife:false,nextCreaturePaysLife:false,catsEnteredThisTurn:0}};
const start=(a:string,b:string,active:0|1=0,startingLife=30,aDeck?:UserDeck|null,bDeck?:UserDeck|null):Game=>({players:[makePlayer(a,startingLife,aDeck),makePlayer(b,startingLife,bDeck)],active,phase:"manutencao",round:1,log:[{id:"start",text:"A batalha por Hemsfell começou.",tone:"system"}],winner:null,selectedAttackers:[],events:1,combatAction:null,pendingResponse:null,turnDeadline:null});
const MATCH_CARD_BACK_URL="/cards/card-back-hemsfell.webp";
const matchArtPreloadPlan=(state:Game)=>{
 const heroPages=state.players.map(player=>deckById(player.heroId).heroPage);
 const visibleCards=state.players.flatMap(player=>[
  ...player.hand,
  ...player.board,
  ...player.support,
  ...(player.terrain?[player.terrain]:[]),
 ]);
 const topCards=state.players.flatMap(player=>player.deck.slice(0,2));
 const allMatchCards=state.players.flatMap(player=>[
  ...player.hand,
  ...player.deck,
  ...player.extraDeck,
  ...player.board,
  ...player.support,
  ...(player.terrain?[player.terrain]:[]),
  ...player.grave,
  ...player.obscuro,
 ]);
 return{
  criticalPages:[...heroPages,...visibleCards.map(card=>card.page),...topCards.map(card=>card.page)],
  backgroundPages:allMatchCards.map(card=>card.page),
 };
};
const firstFreeSlot=(units:Unit[])=>Array.from({length:5},(_,slot)=>slot).find(slot=>!units.some(unit=>unit.slot===slot));
const asUnit=(c:CardDef,slot=0):Unit=>({...c,revealed:undefined,uid:uid(),slot,damage:0,bonusAtk:0,bonusHp:0,attackedThisTurn:false,exhausted:false,summoning:!c.tags.some(tag=>cleanName(tag)==="investida"),frozen:false,stunned:false,suffocated:false,immobilized:false,markers:0,defenseUses:0});
const supportNumbers=(p:Player|undefined,u:Unit)=>{if(!p||u.suffocated)return{atk:0,hp:0};let atk=0,hp=0;for(const source of [...p.board,...p.support]){if(source.uid===u.uid||source.suffocated||Math.abs(source.slot-u.slot)!==1||!/\bSuporte\b/i.test(source.text)&&!source.tags.some(tag=>cleanName(tag)==="suporte"))continue;if((u.modifiers||[]).some(modifier=>modifier.duration==="support"&&modifier.sourceId===source.uid))continue;const match=source.text.match(/Suporte\s*:?\s*([+-]?\d+)\s*\/\s*([+-]?\d+)/i);if(match){atk+=Number(match[1]);hp+=Number(match[2])}}return{atk,hp}};
const equipmentNumbers=(p:Player|undefined,u:Unit)=>{if(!p||u.suffocated)return{atk:0,hp:0};let atk=0,hp=0;for(const source of p.support.filter(card=>card.attachedTo===u.uid&&!card.suffocated)){if(u.modifiers?.some(modifier=>modifier.sourceId===source.uid))continue;if(source.page===197&&["recruta exibido","recruta iludido"].includes(cleanName(effectiveCreatureName(p,u))))continue;const pair=source.text.match(/recebe(?:\s+também|\s+apenas)?\s*([+-]?\d+)\s*\/\s*([+-]?\d+)/i);if(pair){atk+=Number(pair[1]);hp+=Number(pair[2]);continue}const attack=source.text.match(/recebe\s*([+-]?\d+)\s*(?:de\s*)?Ofensividade/i),vitality=source.text.match(/recebe\s*([+-]?\d+)\s*(?:de\s*)?Vitalidade/i);if(attack)atk+=Number(attack[1]);if(vitality)hp+=Number(vitality[1])}return{atk,hp}};
const isCommander=(p:Player|undefined,u:Unit)=>!!p&&p.heroId==="tessalia"&&u.slot===2&&!u.suffocated;
const finiteStat=(value:unknown,fallback=0)=>{const number=Number(value);return Number.isFinite(number)?number:fallback};
const syncDynamicFieldCounts=(g:Game)=>{const field=g.players.flatMap(player=>[...player.board,...player.support,...(player.terrain?[player.terrain]:[])]),wanted=new Set<string>(["Gato","Cachorro"]);field.forEach(unit=>{const dynamic=(unit as any).dynamicStats;if(dynamic?.subtypeCountAcrossFields)wanted.add(dynamic.subtypeCountAcrossFields);if(dynamic?.attackSubtype)wanted.add(dynamic.attackSubtype);if(dynamic?.healthSubtype)wanted.add(dynamic.healthSubtype)});const counts=Object.fromEntries([...wanted].map(subtype=>[subtype,field.filter(card=>hasSubtype(card,subtype)).length]));g.players.forEach(player=>{player.fieldSubtypeCounts={...counts}})};
const dynamicAttackBase=(u:Unit,p?:Player)=>{const dynamic=(u as any).dynamicStats;if(!u.suffocated&&dynamic?.subtypeCountAcrossFields)return finiteStat(p?.fieldSubtypeCounts?.[dynamic.subtypeCountAcrossFields],finiteStat(u.atk));if(!u.suffocated&&dynamic?.attackSubtype)return finiteStat(u.atk)+finiteStat(p?.fieldSubtypeCounts?.[dynamic.attackSubtype]);return finiteStat(u.atk)};
const dynamicHealthBase=(u:Unit,p?:Player)=>{const dynamic=(u as any).dynamicStats;if(!u.suffocated&&dynamic?.subtypeCountAcrossFields)return Math.max(1,finiteStat(p?.fieldSubtypeCounts?.[dynamic.subtypeCountAcrossFields],finiteStat(u.hp,1)));if(!u.suffocated&&dynamic?.healthSubtype)return finiteStat(u.hp,1)+finiteStat(p?.fieldSubtypeCounts?.[dynamic.healthSubtype]);return finiteStat(u.hp,1)};
const statModifiers=(p:Player|undefined,u:Unit)=>{const keep=(value:unknown)=>u.suffocated?Math.min(0,finiteStat(value)):finiteStat(value),support=supportNumbers(p,u),equipment=equipmentNumbers(p,u),structured=(Array.isArray(u.modifiers)?u.modifiers:[]).reduce((sum,item)=>({atk:sum.atk+keep(item?.attack),hp:sum.hp+keep(item?.health)}),{atk:0,hp:0}),catBonus=p&&hasFaction(u,"Gato")?p.board.filter(card=>card.page===218&&!card.suffocated).length:0,commanderBonus=isCommander(p,u)?(p!.level>=2?3:2):0;return{atk:keep(u.bonusAtk)+keep(u.temporaryAtk)+structured.atk+finiteStat(support.atk)+finiteStat(equipment.atk)+(u.suffocated?0:catBonus+commanderBonus),hp:keep(u.bonusHp)+keep(u.temporaryHp)+structured.hp+finiteStat(support.hp)+finiteStat(equipment.hp)+(u.suffocated?0:catBonus)}};
const currentHp=(u:Unit,p?:Player)=>{const modifier=statModifiers(p,u);return dynamicHealthBase(u,p)+modifier.hp-finiteStat(u.damage)};
const currentAtk=(u:Unit,p?:Player)=>{const modifier=statModifiers(p,u);return u.frozen?0:Math.max(0,dynamicAttackBase(u,p)+modifier.atk)};
const markCreatureDamage=(source:CardDef|Unit,damagedOwner:0|1)=>{if(!("uid" in source))return;source.damagedOwnersThisTurn||=[];if(!source.damagedOwnersThisTurn.includes(damagedOwner))source.damagedOwnersThisTurn.push(damagedOwner)};
const hasKeyword=(p:Player|undefined,u:Unit|undefined,keyword:string)=>{if(!u||u.suffocated)return false;const wanted=cleanName(keyword),matches=(value:string)=>cleanName(value).includes(wanted),pairedDuelist=u.page===171?p?.board.some(card=>card.page===172&&!card.suffocated):u.page===172?p?.board.some(card=>card.page===171&&!card.suffocated):false;if((u.page===171||u.page===172)&&(wanted==="barreira magica"||wanted==="robusto"))return !!pairedDuelist;if(wanted==="atropelar"&&isCommander(p,u)&&p!.level>=2)return true;if(hasIntrinsicKeyword(u,keyword))return true;if(!p)return false;return p.support.some(source=>!source.suffocated&&(source.attachedTo===u.uid||Math.abs(source.slot-u.slot)===1&&/\bSuporte\b/i.test(source.text))&&matches(source.text))||!!p.terrain&&!p.terrain.suffocated&&matches(p.terrain.text)};
const defenderCapacity=(p:Player,u:Unit)=>{const match=(u.text+" "+p.support.filter(x=>x.attachedTo===u.uid).map(x=>x.text).join(" ")).match(/Defensor\s*(\d+)/i);return match?Number(match[1]):1};
const cardElement=(c:CardDef)=>cleanName(c.name)==="maestria elemental"?undefined:c.text.match(/Elemento:\s*(Fogo|Água|Terra|Ar)/i)?.[1] as ElementName|undefined;
const elementChainFrom=(c:CardDef):Player["elementChain"]=>ruleElementalChainFrom(cardElement(c)) as Player["elementChain"];
/* Investigation is a public, authoritative selection. Nothing leaves the deck
   before the investigator confirms which cards remain revealed on top. */
const investigate=(g:Game,investigator:Player,target:Player,n:number)=>{
 const owner=g.players.indexOf(investigator) as 0|1,targetOwner=g.players.indexOf(target) as 0|1,amount=Math.min(Math.max(1,n),target.deck.length);
 if(!amount){log(g,"Não havia cartas para Investigar.","manual");return}
 g.pendingDecision={kind:"investigate-selection",owner,effect:{amount,targetOwner,cards:structuredClone(target.deck.slice(0,amount))},context:{owner,sourceId:`investigate-${g.round}-${g.events}`},sourceName:`Investigar ${amount}`};
};
const isDeckSearch=(text:string)=>/(procure|procurar|busque|buscar|busca)/i.test(text)&&/(deck|baralho)/i.test(text);
const searchRequestFor=(owner:0|1,source:CardDef|Unit,player:Player):SearchRequest|null=>{if(!isDeckSearch(source.text))return null;const text=source.text,explicit=text.match(/(?:procure|procurar|busque|buscar|busca)(?:\s+por)?\s*(\d+)/i),sourceMarkers="markers" in source?source.markers:0;let limit=explicit?Number(explicit[1]):1;if(/até preencher todos os seus espaços de criatura/i.test(text))limit=Math.max(1,5-player.board.length);const maxCost=/custo máximo x|custo menor ou igual ao número de marcadores/i.test(text)?sourceMarkers:Number(text.match(/custo máximo\s+(\d+)/i)?.[1]||0)||undefined;let filterLabel="qualquer carta";if(/terreno cruel/i.test(text))filterLabel="Terreno Cruel";else if(/classe Dragão|carta[^.]*Dragão/i.test(text))filterLabel="carta da classe Dragão";else if(/outra Fênix/i.test(text))filterLabel="outra Fênix";else if(/vampiro[^.]*custo 4 ou mais/i.test(text))filterLabel="Vampiro de custo 4 ou mais";else if(/criaturas? [“\"]?Recruta/i.test(text))filterLabel="criatura Recruta";else if(/com Café no nome/i.test(text))filterLabel="carta com Café no nome";else if(/criatura[^.]*Gato/i.test(text))filterLabel="criatura Gato";else if(/tipo Artefato|um artefato/i.test(text))filterLabel=maxCost!==undefined?`Artefato de custo até ${maxCost}`:"Artefato";else if(/criatura sem efeito/i.test(text))filterLabel="criatura sem texto de efeito";else if(/encanto ou feitiço/i.test(text))filterLabel="Encanto ou Feitiço";else if(/feitiço/i.test(text))filterLabel=maxCost!==undefined?`Feitiço de custo até ${maxCost}`:"Feitiço";else if(/cartas? de criatura/i.test(text))filterLabel="Criatura";const destination=/(?:coloque|coloque-o|coloque-a)[^.]*\b(?:em|no) campo\b/i.test(text)?"field":"hand";return{id:uid(),owner,sourceName:source.name,sourcePage:source.page,text,limit,filterLabel,destination,reveal:/revel/i.test(text),optional:/pode (?:procurar|buscar)/i.test(text),maxCost}};
const matchesSearch=(card:CardDef,request:SearchRequest)=>{const text=request.text,name=cleanName(card.name);const quoted=[...text.matchAll(/[“\"]([^”\"]+)[”\"]/g)].map(match=>cleanName(match[1])).find(value=>!value.includes("recruta"));if(quoted&&name!==quoted)return false;if(/terreno cruel/i.test(text)&&card.type!=="Terreno")return false;if(/classe Dragão|carta[^.]*Dragão/i.test(text)&&!hasFaction(card,"Dragão"))return false;if(/outra Fênix/i.test(text)&&!hasFaction(card,"Fênix"))return false;if(/vampiro/i.test(text)&&!hasFaction(card,"Vampiro"))return false;if(/custo 4 ou mais/i.test(text)&&card.cost<4)return false;if(/criaturas? [“\"]?Recruta/i.test(text)&&!hasFaction(card,"Recruta"))return false;if(/com Café no nome/i.test(text)&&!name.includes("cafe"))return false;if(/criatura[^.]*Gato/i.test(text)&&!hasFaction(card,"Gato"))return false;if(/tipo Artefato|um artefato/i.test(text)&&card.type!=="Artefato")return false;if(/criatura sem efeito/i.test(text)&&(card.type!=="Criatura"||card.text.trim().length>0))return false;if(/encanto ou feitiço/i.test(text)&&card.type!=="Encanto"&&card.type!=="Feitiço")return false;if(/feitiço/i.test(text)&&!/encanto ou feitiço/i.test(text)&&card.type!=="Feitiço")return false;if(/cartas? de criatura/i.test(text)&&card.type!=="Criatura")return false;if(request.maxCost!==undefined&&card.cost>request.maxCost)return false;return true};
const applySearchSelection=(g:Game,request:SearchRequest,selectedIds:string[])=>{const player=g.players[request.owner],chosen:CardDef[]=[];for(const id of selectedIds.slice(0,request.limit)){const index=player.deck.findIndex(card=>card.id===id&&matchesSearch(card,request));if(index>=0)chosen.push(player.deck.splice(index,1)[0])}for(const original of chosen){const card={...original,revealed:request.reveal||undefined};if(request.destination==="field"){if(card.type==="Criatura"){const slot=firstFreeSlot(player.board);if(slot!==undefined){player.board.push(asUnit({...card,revealed:undefined},slot));continue}}else if(card.type==="Terreno"){if(player.terrain)sendToGrave(g,player,player.terrain);player.terrain=asUnit({...card,revealed:undefined},0);continue}else if(card.type==="Encanto"){const slot=firstFreeSlot(player.support);if(slot!==undefined){player.support.push(asUnit({...card,revealed:undefined},slot));continue}}log(g,`${card.name} não encontrou uma zona de campo válida e foi colocada na mão.`,"manual")}player.hand.push(card)}player.deck=shuffle(player.deck);const publicNames=request.reveal?chosen.map(card=>card.name).join(", "):"conteúdo oculto";log(g,`${request.sourceName} encontrou ${chosen.length} carta(s) (${publicNames}) e o Deck Principal foi embaralhado.`,request.reveal?"effect":"shuffle");return chosen};
const isFast=(c:CardDef)=>c.type==="Feitiço"&&(c.tags.includes("Acelerado")||/^\s*Acelerado\b/i.test(c.text)||/instantâneo|instantaneo/i.test(c.text));
const effectiveCost=(c:CardDef,p:Player)=>{let cost=c.cost+Number((c as CardDef&{costModifier?:number}).costModifier||0);if(c.page===13&&p.board.some(x=>x.page===23))cost-=2;if(c.page===14&&p.board.some(x=>x.page===24))cost-=3;if(c.page===42&&p.turnCardsPlayed>0)cost-=1;if(c.page===88)cost=Math.max(0,p.hand.length-1);if(c.page===139)cost=Math.max(1,cost-Math.max(0,p.lifeLostThisTurn||0));if(c.page===149)cost-=p.board.filter(x=>hasFaction(x,"Vampiro")).length;if(c.page===203)cost-=p.board.length*2;if(c.page===224&&[...p.board,...p.support].some(x=>hasFaction(x,"Gato")))cost=0;if(p.heroId==="goblin"&&p.level>=3&&p.turnCardsPlayed===0&&hasFaction(c,"Goblin"))cost=0;if(p.heroId==="uruk"&&p.level>=2&&c.type==="Feitiço"&&p.turnSpellsPlayed===0)cost-=1;if(p.turnCardsPlayed===0&&p.board.some(x=>x.page===219&&!x.suffocated))cost-=1;const boardEffects=[...p.board,...p.support,p.terrain||undefined].filter(Boolean) as Unit[];if(c.type==="Feitiço"&&boardEffects.some(unit=>/seus feitiços custam 1 a menos de energia/i.test(unit.text+unit.tags.join(" "))))cost-=1;const queuedDiscount=(p.nextCardDiscounts||[]).find(rule=>(rule.expiresRound==null||rule.expiresRound>0)&&(!rule.type||rule.type===c.type)&&(!rule.typeNot||rule.typeNot!==c.type));if(queuedDiscount)cost-=queuedDiscount.amount||0;cost-=p.nextCardDiscount;if(c.type!="Criatura")cost-=p.nextNonCreatureDiscount;if(c.type==="Feitiço")cost-=p.nextSpellDiscount;return Math.max(0,cost)};
/* Reserva complements normal energy for every non-creature card. During a
   response it remains the sole legal source for accelerated spells. */
const playableEnergy=(c:CardDef,p:Player,asResponse=false)=>asResponse?p.reserve:p.energy+(c.type!=="Criatura"?p.reserve:0);
const creaturePaysLife=(c:CardDef,p:Player,asResponse=false)=>!asResponse&&c.type==="Criatura"&&!!(p.nextCreaturePaysLife||p.nextSummonPaysLife);
const playableResource=(c:CardDef,p:Player,asResponse=false)=>creaturePaysLife(c,p,asResponse)?(p.heroId==="saymon"?Math.max(0,p.life-1):p.life):playableEnergy(c,p,asResponse);
const cardPlayRequirementMet=(c:CardDef,p:Player,g?:Game,owner:0|1=0)=>[12,13,14].includes(c.page)?p.board.length<5:c.page===17?!!g&&p.board.some(card=>hasFaction(card,"Dragão")&&!card.exhausted&&!card.stunned)&&g.players[1-owner].board.length>0:c.page!==48||p.grave.some(card=>hasFaction(card,"Goblin"));
const spendCardEnergy=(p:Player,c:CardDef,cost:number,asResponse=false)=>{if(asResponse){p.reserve-=cost;return}const fromMain=Math.min(p.energy,cost);p.energy-=fromMain;const remainder=cost-fromMain;if(remainder>0&&c.type!=="Criatura")p.reserve-=remainder};
const bankRemainingEnergy=(p:Player)=>{if(!p.noReserveStorageThisTurn)p.reserve=Math.min(3,p.reserve+p.energy);p.energy=0};
const resetTurnState=(p:Player)=>{p.turnCardsPlayed=0;p.turnSpellsPlayed=0;p.turnDeaths=0;p.lifeLostThisTurn=0;p.lifeLossEvents=0;p.levelUpsThisTurn=0;p.abilityUses={};if(p.heroId==="saymon")p.heroXP=0;p.elementChain=undefined;p.nextElementEffects=[];p.lastElement=undefined;p.lastElementSource=undefined;p.catsEnteredThisTurn=0;p.nextCardDiscount=0;p.nextNonCreatureDiscount=0;p.nextSpellDiscount=0;p.nextSummonPaysLife=false;p.nextCreaturePaysLife=false;p.noReserveStorageThisTurn=false;[...p.board,...p.support,...(p.terrain?[p.terrain]:[])].forEach(unit=>{unit.temporaryAtk=0;unit.temporaryHp=0;unit.temporaryTags=[];unit.modifiers=(unit.modifiers||[]).filter(modifier=>modifier.duration!=="turn")})};
const draw=(g:Game,p:Player,n=1)=>{for(let i=0;i<n;i++){const c=p.deck.shift();if(c)p.hand.push(c);else{p.life=0;log(g,`${deckById(p.heroId).name} tentou comprar sem cartas e perdeu.`,"danger")}}};
/* Every "when you cast a spell" permanent resolves here. Keeping these triggers
   together ensures player and AI casts follow the exact same rule path. */
const resolveSpellCastTriggers=(g:Game,owner:0|1,spell:CardDef,onTrigger?:(label:string,detail:string,source:CardDef|Unit,target?:CardDef)=>void)=>{
 const p=g.players[owner],element=cardElement(spell),announce=(label:string,detail:string,source:CardDef|Unit)=>onTrigger?.(label,detail,source,spell);
 if(element){p.lastElement=element;p.lastElementSource=spell.name}
 p.board.filter(unit=>unit.page===78&&!unit.suffocated).forEach(unit=>{unit.bonusAtk+=1;announce("GATILHO · ARQUIMAGO",`${unit.name} recebeu +1/+0 por ${spell.name}.`,unit);log(g,`Arquimago Sombrio recebeu +1/+0 ao conjurar ${spell.name}.`,"effect")});
 p.board.filter(unit=>unit.page===79&&!unit.suffocated&&g.active===owner).forEach(unit=>{const key=`athos-spell-${unit.uid}`;if(!claimOncePerTurn(p.abilityUses,key))return;draw(g,p);announce("GATILHO · ATHOS",`${unit.name} comprou 1 carta por ${spell.name}.`,unit);log(g,`Athos, o Bibliotecário comprou 1 carta ao conjurar ${spell.name}.`,"effect")});
 p.board.filter(unit=>unit.page===80&&!unit.suffocated).forEach(unit=>{unit.markers=(unit.markers||0)+1;announce("GATILHO · FEITICEIRA",`${unit.name} recebeu 1 marcador por ${spell.name}.`,unit);log(g,`Feiticeira Espectral recebeu 1 marcador ao conjurar ${spell.name}.`,"effect")});
 if(element==="Ar"&&p.support.some(unit=>unit.page===71&&!unit.suffocated)&&!p.abilityUses.aeromancia){p.reserve=Math.min(3,p.reserve+1);p.abilityUses.aeromancia=1;const source=p.support.find(unit=>unit.page===71&&!unit.suffocated)!;announce("GATILHO · AEROMANCIA",`Aeromancia concedeu 1 de Reserva por ${spell.name}.`,source);log(g,"Aeromancia concedeu 1 de energia à Reserva.","energy")}
 if(element==="Água"&&p.support.some(unit=>unit.page===72&&!unit.suffocated)&&!p.abilityUses.hidromancia){p.life=Math.min(30,p.life+3);p.abilityUses.hidromancia=1;const source=p.support.find(unit=>unit.page===72&&!unit.suffocated)!;announce("GATILHO · HIDROMANCIA",`Hidromancia restaurou 3 de vida por ${spell.name}.`,source);log(g,"Hidromancia restaurou 3 de vida.","heal")}
};
/* Start-of-turn events share one resolver so they cannot be skipped by either AI
   or player maintenance. */
const resolveMaintenanceTriggers=(g:Game,owner:0|1)=>{
 g.players.forEach(player=>player.board.forEach(unit=>{unit.modifiers=(unit.modifiers||[]).filter((modifier:any)=>modifier.expiresOnMaintenanceOwner!==owner)}));
 const p=g.players[owner],foe=g.players[owner===0?1:0];
 p.board.filter(unit=>unit.page===134&&!unit.suffocated).forEach(unit=>{p.life-=2;p.lifeLostThisTurn=(p.lifeLostThisTurn||0)+2;p.lifeLossEvents=(p.lifeLossEvents||0)+1;const markers=(unit as any).markers;(unit as any).markers=typeof markers==="number"?markers+1:{...(markers||{}),action:Number(markers?.action||0)+1};log(g,`O Cobra Dor fez ${deckById(p.heroId).name} perder 2 de vida e recebeu 1 marcador.`,"damage")});
 if(p.heroId==="gimble"&&p.level>=3)p.board.filter(unit=>hasFaction(unit,"Dragão")&&!unit.suffocated).forEach(unit=>{unit.bonusAtk++;unit.bonusHp++;log(g,`Gimble III concedeu +1/+1 a ${unit.name} na manutenção.`,"effect")});
 if(p.heroId==="goblin"&&p.level>=2){draw(g,p);log(g,"Sr. Goblin II comprou 1 carta adicional na manutenção.","effect")}
 const ngoroMaintenanceKey=`ngoro-maintenance-${g.round}`;
 if(p.heroId==="ngoro"&&p.level>=1&&!g.pendingDecision&&!p.abilityUses[ngoroMaintenanceKey]){p.abilityUses[ngoroMaintenanceKey]=1;g.pendingDecision={kind:"choice",owner,effect:{choices:[[{type:"investigate",amount:1,target:"controllerDeck"}],[{type:"investigate",amount:1,target:"opponentDeck"}]]},context:{owner,sourceId:`hero-ngoro-${g.round}`,afterResourceChoice:true},sourceName:"Ngoro I · Escolha um deck"};log(g,"Após escolher os recursos da manutenção, Ngoro I permite escolher um deck para Investigar 1.","effect")}
 p.support.filter(unit=>unit.page===101&&!unit.suffocated).forEach(unit=>{p.energy=Math.min(10,p.energy+1);log(g,"Trabalho Honesto concedeu 1 de energia.","energy")});
 if(p.terrain?.page===290&&p.board.some(unit=>!unit.text.trim())){draw(g,p);log(g,"Recrutamento Revolucionário comprou 1 carta por uma criatura sem efeito.","effect")}
};
const resolveCreatureEntryTriggers=(g:Game,owner:0|1,entering:Unit)=>{
 const p=g.players[owner],foe=g.players[owner===0?1:0];
 if(hasFaction(entering,"Gato"))p.catsEnteredThisTurn++;
 if(entering.page===246){entering.exhausted=true;log(g,"Gato Dorminhoco entrou virado.","effect")}
 if(entering.page===88){const cardsInHand=Math.max(0,p.hand.length);entering.bonusAtk+=cardsInHand;entering.bonusHp+=cardsInHand;log(g,`Acumulador recebeu +${cardsInHand}/+${cardsInHand} ao entrar em campo.`,"effect")}
 /* Cross-player entry trigger: each Extrator attacks the newly summoned creature. */
 foe.board.filter(unit=>unit.page===136&&!unit.suffocated&&!unit.exhausted).forEach(unit=>{const dealt=currentAtk(unit,foe),received=currentAtk(entering,p);entering.damage+=dealt;unit.damage+=received;unit.exhausted=true;log(g,`Extrator da Lua Sangrenta atacou ${entering.name} ao ser invocada.`,"combat")});
 if(hasFaction(entering,"Dragão"))p.board.filter(unit=>unit.page===11&&!unit.suffocated&&unit.uid!==entering.uid).forEach(unit=>{foe.life-=2;p.damageDealt+=2;markCreatureDamage(unit,owner===0?1:0);log(g,`Valorian causou 2 de dano ao herói inimigo quando outro Dragão aliado, ${entering.name}, entrou em campo.`,"damage")});
 if(hasFaction(entering,"Goblin"))p.board.filter(unit=>unit.page===35&&!unit.suffocated).forEach(unit=>{foe.life-=1;p.damageDealt+=1;markCreatureDamage(unit,owner===0?1:0);log(g,`Bombardeiro Gente Boa causou 1 de dano ao herói inimigo ao invocar ${entering.name}.`,"damage")});
};
const cleanName=(value:unknown)=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g," ").trim().toLowerCase();
const hasFirstAct=(unit:Unit)=>unit.tags.some(tag=>cleanName(tag)==="primeiro ato")||/\bprimeiro ato\b/i.test(unit.text)||(unit.abilities||[]).some(ability=>ability.trigger==="onEnter");
const effectiveCreatureName=(player:Player,unit:Unit)=>{let name=unit.name;for(const attachment of player.support.filter(card=>card.attachedTo===unit.uid&&!card.suffocated)){const rename=attachment.text.match(/se equipad[ao][^“"]*[“"]([^”"]+)[”"][\s\S]*?(?:agora\s+se\s+chama|passa\s+a\s+se\s+chamar)[^“"]*[“"]([^”"]+)[”"]/i);if(rename&&cleanName(name)===cleanName(rename[1]))name=rename[2]}return name};
const mandatoryIndomitableAttacker=(player:Player)=>player.board.find(unit=>{const used=unit.attacksThisTurn??(unit.attackedThisTurn?1:0);return !unit.exhausted&&used<(unit.attackLimit||1)&&!unit.summoning&&!unit.stunned&&!unit.immobilized&&!/não pode atacar/i.test(unit.text)&&hasKeyword(player,unit,"Indomável")});
const heroEvolutionProgress=(player:Player)=>{if(player.heroId==="uruk")return player.spellsPlayed||0;if(player.heroId==="gimble")return player.board.filter(card=>hasFaction(card,"Dragão")).length;if(player.heroId==="goblin")return player.turnCardsPlayed||0;if(player.heroId==="quarion")return new Set(player.board.map(unit=>cleanName(effectiveCreatureName(player,unit))).filter(Boolean)).size;if(player.heroId==="rasmus")return [...player.board,...player.support].filter(card=>hasFaction(card,"Gato")).length;if(player.heroId==="zayan")return [...player.board,...player.support,...(player.terrain?[player.terrain]:[])].filter(card=>!card.text.trim()).length;if(player.heroId==="natureza")return [...player.board,...player.support,...(player.terrain?[player.terrain]:[])].reduce((sum,card)=>sum+(card.markers||0),0);return player.heroXP};
const numericAmount=(value:string|undefined,fallback=1)=>{const word={um:1,uma:1,dois:2,duas:2,tres:3}[cleanName(value||"") as "um"|"uma"|"dois"|"duas"|"tres"],parsed=Number(value);return word??(Number.isFinite(parsed)?parsed:fallback)};
const baseCard=(c:CardDef|Unit):CardDef=>{const template=cards.find(card=>card.page===c.page)??c;return{page:template.page,id:c.id,name:template.name,type:template.type,cost:template.cost,atk:template.atk,hp:template.hp,text:template.text,tags:[...template.tags],subtypes:[...(template.subtypes||[])],abilities:template.abilities?structuredClone(template.abilities):undefined,rules:template.rules,diagnostics:template.diagnostics,image:template.image,hero:template.hero,imageCard:template.imageCard,generatedImage:c.generatedImage}};
const returnImage=(g:Game,p:Player,c:CardDef|Unit,reason="deixou o campo")=>{const card=baseCard(c);if("generatedImage" in c&&c.generatedImage){log(g,`${card.name} ${reason} e a cópia criada se dissipou.`,"image");return}if(!p.extraDeck.some(x=>x.id===card.id))p.extraDeck.push(card);log(g,`${card.name} ${reason} e retornou ao Deck Extra.`,"image")};
const sendToGrave=(g:Game,p:Player,c:CardDef|Unit)=>{if(c.imageCard)returnImage(g,p,c,"foi resolvida");else p.grave.push(baseCard(c))};
const sendToObscuro=(g:Game,p:Player,c:CardDef|Unit)=>{p.obscuro.push(baseCard(c));log(g,`${c.name} foi banida e enviada ao Obscuro.`,"obscuro")};
/* A bound Artifact follows its creature whenever that creature leaves the battlefield.
   Card-specific replacements (such as banishment or returning an Image) still win over
   the default graveyard destination, as required by the "golden rule". */
const discardLinkedArtifacts=(g:Game,p:Player,creatureUid:string)=>{const linked=p.support.filter(card=>card.attachedTo===creatureUid);p.support=p.support.filter(card=>card.attachedTo!==creatureUid);linked.forEach(card=>{if(card.page===154)sendToObscuro(g,p,card);else if(card.imageCard)returnImage(g,p,card,"foi desvinculada");else sendToGrave(g,p,card)});return linked.length};
const summonImage=(g:Game,owner:0|1,name:string,destination?:"field"|"hand",temporary=false,attachedToUid?:string)=>{const p=g.players[owner],wanted=cleanName(name);const index=p.extraDeck.findIndex(x=>cleanName(x.name)===wanted||cleanName(x.name).includes(wanted)||wanted.includes(cleanName(x.name)));if(index<0){log(g,`A Imagem “${name}” não está disponível no Deck Extra.`,"danger");return false}const template=p.extraDeck[index],card={...template,id:`${template.id}-generated-${uid()}`,generatedImage:true};const target=destination||(card.type==="Feitiço"?"hand":"field");if(target==="hand"){p.hand.push(card);log(g,`${card.name} foi criada na mão a partir do Deck Extra.`,"image");return true}const creatureSlot=firstFreeSlot(p.board),supportSlot=firstFreeSlot(p.support);if(card.type==="Criatura"&&creatureSlot===undefined){log(g,`Não há espaço para invocar ${card.name} na zona de criaturas.`,"danger");return false}if((card.type==="Artefato"||card.type==="Encanto")&&supportSlot===undefined){log(g,`Não há espaço para invocar ${card.name} na zona auxiliar.`,"danger");return false}const isTrambuco=cleanName(card.name)===cleanName("TRAMBUCO DO PIPOCO"),artifactCandidates=card.type==="Artefato"?p.board.filter(creature=>isTrambuco?(hasFaction(creature,"Goblin")&&!p.support.some(a=>a.slot===creature.slot&&a.page!==46)):!p.support.some(a=>a.attachedTo===creature.uid)):[],artifactHost=card.type==="Artefato"?(attachedToUid?artifactCandidates.find(creature=>creature.uid===attachedToUid):artifactCandidates[0]):undefined;if(card.type==="Artefato"&&!artifactHost){log(g,`${card.name} é um Artefato e precisa de uma criatura sem outro Artefato para ser vinculada. A Imagem permanece no Deck Extra.`,"danger");return false}const slot=card.type==="Criatura"?creatureSlot!:card.type==="Artefato"?artifactHost!.slot:supportSlot!;const unit={...asUnit(card,slot),temporary,attachedTo:artifactHost?.uid};if(card.type==="Criatura"){p.board.push(unit);resolveCreatureEntryTriggers(g,owner,unit);}else if(card.type==="Artefato"||card.type==="Encanto")p.support.push(unit);else p.hand.push(card);log(g,`${card.name} foi invocada do Deck Extra para ${card.type==="Criatura"?`o espaço ${slot+1} de criaturas`:card.type==="Feitiço"?"a mão":card.type==="Artefato"?`o espaço ${slot+1}, vinculada a ${artifactHost?.name}`:`o espaço auxiliar ${slot+1}`}.`,"image");return true};
const summonCreatedImage=(g:Game,owner:0|1,name:string)=>{const p=g.players[owner],wanted=cleanName(name),template=extraFor(p.heroId).find(x=>cleanName(x.name)===wanted)||cards.find(x=>x.imageCard&&cleanName(x.name)===wanted);if(!template){log(g,`A Imagem criada “${name}” não foi encontrada no catálogo.`,"danger");return false}if(template.type==="Feitiço"){p.hand.push({...template,id:`${template.id}-generated-${uid()}`});return true}const host=template.type==="Artefato"?p.board.find(creature=>!p.support.some(a=>a.attachedTo===creature.uid)):undefined,slot=template.type==="Criatura"?firstFreeSlot(p.board):template.type==="Artefato"?host?.slot:firstFreeSlot(p.support);if(slot===undefined)return false;const unit={...asUnit({...template,id:`${template.id}-generated-${uid()}`},slot),generatedImage:true,attachedTo:host?.uid};if(template.type==="Criatura")p.board.push(unit);else p.support.push(unit);return true};
const createGhostImage=(g:Game,owner:0|1)=>{const p=g.players[owner],slot=firstFreeSlot(p.board);if(slot===undefined){log(g,"Não há espaço para criar a Criatura Fantasma.","danger");return}const ghost:CardDef={page:108,id:`ghost-${uid()}`,name:"Criatura Fantasma",type:"Criatura",cost:0,atk:1,hp:1,text:'Voar. Imagem criada por Cemitério Amaldiçoado.',tags:["Voar"],image:"drive://1gI26HASPp9KM_GtloaqBIj8ukY7Nq3CC/page/108",hero:false,imageCard:true};p.board.push(asUnit(ghost,slot));log(g,"Cemitério Amaldiçoado criou uma Imagem de Criatura Fantasma 1/1 com Voar.","image")};
const removeDead=(g:Game,onDeath?:(owner:0|1,card:Unit)=>void,depth=0)=>{g.players.forEach((p,ownerIndex)=>{const owner=ownerIndex as 0|1;p.board.filter(u=>currentHp(u,p)<=0&&hasKeyword(p,u,"Indestrutível")).forEach(u=>{u.damage=Math.max(0,(u.hp||1)+u.bonusHp+supportNumbers(p,u).hp-1);log(g,`${u.name} permaneceu em campo com 1 de vitalidade por ser Indestrutível.`,"effect")});p.board.filter(u=>currentHp(u,p)<=0&&hasFaction(u,"Dragão")&&!hasKeyword(p,u,"Indestrutível")).forEach(u=>{const protector=p.board.find(source=>source.page===9&&!source.suffocated&&!p.abilityUses[`dancadon-${source.uid}-${g.round}`]);if(!protector)return;const totalHp=Math.max(1,currentHp(u,p)+Number(u.damage||0));u.damage=Math.max(0,totalHp-1);p.abilityUses[`dancadon-${protector.uid}-${g.round}`]=1;log(g,`Dancadon protegeu ${u.name} do dano letal; ela permaneceu com 1 de vida.`,"effect")});const dead=p.board.filter(u=>currentHp(u,p)<=0);if(!dead.length)return;const survivors=p.board.filter(u=>currentHp(u,p)>0),catsBeforeDeath=[...survivors,...dead].filter(card=>hasFaction(card,"Gato")).length;p.board=survivors;p.turnDeaths+=dead.length;for(const u of dead){const returnsAsLoneCat=u.page===217&&catsBeforeDeath===1;if(!returnsAsLoneCat){if(u.imageCard)returnImage(g,p,u,"foi destruída");else p.grave.push(baseCard(u))}const linked=p.support.filter(a=>a.attachedTo===u.uid);linked.forEach(a=>{if(a.page===154)sendToObscuro(g,p,a);else if(a.imageCard)returnImage(g,p,a,"foi desvinculada");else p.grave.push(baseCard(a));log(g,`${a.name} deixou o campo porque ${u.name} foi destruída.`,"danger")});p.support=p.support.filter(a=>a.attachedTo!==u.uid);p.support.filter(card=>card.page===126).forEach(card=>card.markers++);const enemyOwner=(owner===0?1:0) as 0|1,enemy=g.players[enemyOwner];if(g.active===enemyOwner)enemy.board.filter(card=>card.page===173&&!card.suffocated&&!enemy.abilityUses[`cavaleiro-negro-${card.uid}`]).forEach(card=>{card.markers++;card.bonusAtk++;card.bonusHp++;enemy.abilityUses[`cavaleiro-negro-${card.uid}`]=1;log(g,`Cavaleiro Negro recebeu um marcador +1/+1 após a destruição de ${u.name}.`,"effect")});if(returnsAsLoneCat){p.board.push(asUnit(baseCard(u),u.slot));log(g,"Gato de Rua voltou ao campo por ser o único Gato aliado.","effect")}else log(g,`${u.name} foi destruída e enviada ao Cemitério.`,"danger");/* Death/leave triggers resolve before replacement images are made. Tifon III is
      the only source here allowed to repeat a Last Breath. */
     if(cleanName(u.name)==="clone de agua"&&u.lastDamagedBy){const source=enemy.board.find(card=>card.uid===u.lastDamagedBy);if(source){applyCloneRetaliation(source,u.text);log(g,`Clone de Água aplicou seus efeitos apenas em ${source.name}, a criatura que a destruiu.`,"elemental")}}
     if(hasKeyword(p,u,"Último Suspiro")||(u.abilities||[]).some(ability=>ability.trigger==="onDestroyed")){
      const copies=deckById(p.heroId).id==="tifon"&&p.level>=3?2:1;
      for(let copy=0;copy<copies;copy++){log(g,`Último Suspiro de ${u.name}${copies>1?` (${copy+1}/${copies})`:""} foi ativado.`,"effect");onDeath?.(owner,u)}
      if(deckById(p.heroId).id==="tifon"&&p.level>=2){const before:[number,number]=[g.players[0].life,g.players[1].life];enemy.life-=1;resolveLifeLossTriggers(g,before);log(g,`Tifon II causou 1 de dano ao herói inimigo pelo Último Suspiro de ${u.name}.`,"damage")}
     }
     if(hasFaction(u,"Dragão")&&deckById(p.heroId).id==="gimble"){p.life=Math.min(30,p.life+1);log(g,"Gimble I curou 1 de vida quando um Dragão deixou o campo.","heal")}
     if(hasFaction(u,"Goblin")){
      p.support.filter(x=>x.page===39).forEach(x=>{x.markers=(x.markers||0)+1});
      const goblinKey="goblin-leave-draw";
      if(deckById(p.heroId).id==="goblin"&&!p.abilityUses[goblinKey]){p.abilityUses[goblinKey]=1;draw(g,p);log(g,"Sr. Goblin I comprou 1 carta quando um Goblin deixou o campo.","effect")}
     }
     p.board.filter(card=>card.page===114&&card.uid!==u.uid&&!card.suffocated).forEach(card=>{card.temporaryAtk=(card.temporaryAtk||0)+1;log(g,`Vingador recebeu +1/+0 até o fim do turno após a morte de ${u.name}.`,"effect")});
     if(!u.imageCard&&hasFaction(u,"Dragão")&&p.terrain?.page===22)summonImage(g,owner,"Dragão Filhote");if(!u.imageCard&&p.terrain?.page===108)createGhostImage(g,owner)}if(dead.length&&deckById(p.heroId).id==="tifon"){p.heroXP+=dead.length;if(g.active===owner){const remaining=Math.max(0,1-(p.abilityUses["tifon-draws"]||0)),drawCount=Math.min(dead.length,remaining);if(drawCount){draw(g,p,drawCount);p.abilityUses["tifon-draws"]=(p.abilityUses["tifon-draws"]||0)+drawCount;log(g,`Tifon I comprou ${drawCount} carta(s) por mortes aliadas neste turno.`,"effect")}}}});if(depth<4&&g.players.some(p=>p.board.some(u=>currentHp(u,p)<=0&&!hasKeyword(p,u,"Indestrutível"))))removeDead(g,onDeath,depth+1)};
const levelTargets=(p:Player)=>{const nums=deckById(p.heroId).requirement.match(/\d+/g)?.map(Number)||[3,6];return nums.length>1?nums:[nums[0],nums[0]*2]};
const isActiveAbility=(heroId:string,slot:number)=>heroId==="gimble"&&slot===1||heroId==="saymon"&&(slot===0||slot===1)||heroId==="ngoro"&&(slot===1||slot===2)||heroId==="natureza"&&slot===0;
const phaseNames:Record<Phase,string>={manutencao:"Manutenção",principal:"Principal",combate:"Combate",fim:"Finalização"};
const imageChoices:Record<number,string[]>={70:["Maestria Elemental: Piromancia","Maestria Elemental: Hidromancia","Maestria Elemental: Geomancia","Maestria Elemental: Aeromancia"],87:["Ignis, a Chama Eterna","Terron, o Guardião Ancestral","Undaris, a Voz do Oceano","Zephyrus, o Relâmpago Voraz"]};
const directImages:Record<number,string>={12:"Dragão Filhote",13:"Dragão Jovem",14:"Dragão Ancião",61:"Clone de Água",209:"Tessália, a Mão de Ferro"};
const keywordDescriptions:Record<string,string>={
 "Voar":"Só pode ser bloqueada por criaturas que também tenham Voar.",
 "Barreira Mágica":"Não pode ser selecionada como alvo de efeitos; efeitos sem alvo ainda funcionam.",
 "Atropelar":"O dano excedente à vitalidade da defensora é causado ao herói defensor.",
 "Triturar":"Envia uma carta do topo do deck indicado ao Cemitério.",
 "Primeiro Ato":"Ativa o efeito imediatamente quando a carta entra em campo.",
 "Último Suspiro":"Ativa o efeito imediatamente quando a carta é destruída.",
 "Investida":"Pode atacar no mesmo turno em que entra em campo.",
 "Indomável":"Precisa atacar sempre que estiver apta.",
 "Furtivo":"Não pode ser bloqueada.",
 "Veloz":"Contra uma criatura sem Veloz, causa dano antes de sofrer o contra-ataque.",
 "Robusto":"Reduz em 1 cada instância de dano recebida.",
 "Alerta":"Esta criatura não fica virada após atacar.",
 "Defensor X":"Pode defender a quantidade X de criaturas atacantes.",
 "Roubo de Vida":"O dano causado restaura a mesma quantidade de vida ao controlador.",
 "Toque da Morte":"Qualquer dano causado a uma criatura a destrói, independentemente da vitalidade restante.",
 "Acelerado":"Pode ser jogado como resposta durante o turno do oponente, pagando Reserva.",
 "Congelado":"A criatura afetada fica com ofensividade 0.",
 "Atordoado":"A criatura afetada não pode atacar nem defender.",
 "Sufocado":"Perde temporariamente seus efeitos e palavras-chave.",
 "Suporte":"Criaturas adjacentes recebem o efeito descrito.",
 "Imobilizado":"Não desvira na próxima etapa de manutenção.",
 "Indestrutível":"Não pode ser destruída por combate ou por efeitos de carta e herói.",
 "Investigar X":"Olhe as X cartas do topo; cada uma pode permanecer revelada no topo ou ser arquivada no fundo.",
 "Fura-Fila":"Ativa o efeito se não for a primeira carta jogada por você no turno atual.",
 "Procure":"Olhe apenas o seu próprio Deck Principal, escolha as cartas que atendem ao efeito e embaralhe o deck ao concluir."
};
const keywordIcons:Record<string,string>={
 "Voar":"↟","Barreira Mágica":"◈","Atropelar":"➤","Triturar":"⛏","Primeiro Ato":"✦","Último Suspiro":"☠",
 "Investida":"➚","Indomável":"⚔","Furtivo":"◐","Veloz":"⚡","Robusto":"⬢","Alerta":"◉","Defensor X":"🛡",
 "Roubo de Vida":"♥","Toque da Morte":"†","Acelerado":"»","Congelado":"❄","Atordoado":"✹","Sufocado":"⊘",
 "Suporte":"✚","Imobilizado":"⌁","Indestrutível":"◆","Investigar X":"⌕","Fura-Fila":"↯","Procure":"⌖"
};
const keywordPattern=/(Barreira Mágica|Toque da Morte|Roubo de Vida|Último Suspiro|Primeiro Ato|Indestrutível|Imobilizado|Atordoado|Congelado|Acelerado|Atropelar|Investida|Indomável|Furtivo|Robusto|Alerta|Suporte|Triturar|Voar|Veloz|Fura-Fila|Defensor\s+\d+|Investigar\s+\d+|Procure|Procurar|Busque|Buscar|Busca)/gi;
const keywordEntry=(value:string)=>{const normalized=cleanName(value);const key=normalized.startsWith("defensor ")?"Defensor X":normalized.startsWith("investigar ")?"Investigar X":["procure","procurar","busque","buscar","busca"].includes(normalized)?"Procure":Object.keys(keywordDescriptions).find(name=>cleanName(name)===normalized);return key?{key,description:keywordDescriptions[key]}:null};

function RichCardText({text}:{text:string}){const parts=text.split(keywordPattern);return <span className="rich-card-text">{parts.map((part,index)=>{const keyword=keywordEntry(part);return keyword?<span className="keyword-term" data-tip={keyword.description} tabIndex={0} key={`${part}-${index}`}><strong>{part}</strong></span>:<span key={`${part}-${index}`}>{part}</span>})}</span>}
function KeywordBadge({name}:{name:string}){const keyword=keywordEntry(name);return <span className={`keyword-badge ${keyword?"known":""}`} data-tip={keyword?.description}>{name}</span>}
const activeCardEffect=(card:CardDef,player:Player,owner:0|1,response:PendingResponse|null)=>{const cost=effectiveCost(card,player),lifeLoss=Number(card.text.match(/\bperca\s+(\d+)\s+(?:de\s+)?vida/i)?.[1]||0),needsSacrifice=/sacrifique[^.]*criatura/i.test(card.text);if(cost>playableEnergy(card,player)||(lifeLoss&&player.life<=lifeLoss)||(needsSacrifice&&!player.board.length))return"";if(card.tags.some(tag=>cleanName(tag)==="fura fila")&&player.turnCardsPlayed>0)return"FURA-FILA";const element=cardElement(card);if(element&&player.elementChain?.element===element)return`CADEIA · ${player.elementChain.effect.toUpperCase()}`;if(needsSacrifice)return"SACRIFÍCIO";if(lifeLoss)return`PERDA · ${lifeLoss}`;if(isFast(card)&&response?.responder===owner)return"RESPOSTA";if(cost!==card.cost)return cost<card.cost?"CUSTO ↓":"CUSTO ↑";return""};
 const canonicalUnit=(unit:Unit)=>compileCard(unit) as Unit;
 const activatedUnitAbility=(unit:Unit)=>unit.abilities?.find(entry=>entry.trigger==="activated")??canonicalUnit(unit).abilities?.find(entry=>entry.trigger==="activated");
 const hasActivatableUnitEffect=(unit:Unit)=>hasActivatableEffect(unit)||!!activatedUnitAbility(unit);
 const markerAmount=(unit:Unit)=>{const markers=(unit as any).markers;return typeof markers==="number"?markers:Object.values(markers||{}).reduce((sum,value)=>sum+Number(value||0),0)};
 const centerDragPreview=(event:React.DragEvent<HTMLElement>)=>{const node=event.currentTarget;if(!event.dataTransfer||!node)return;const rect=node.getBoundingClientRect();event.dataTransfer.setDragImage(node,rect.width/2,rect.height/2)};
 const canActivateUnit=(player:Player,unit:Unit)=>{const localAbility=unit.abilities?.find(entry=>entry.trigger==="activated"),ability=localAbility??activatedUnitAbility(unit),used=ability&&player.abilityUses?.[`${unit.uid||unit.id}:${ability.id}`],auxiliary=unit.type!=="Criatura";/* Every auxiliary activated effect turns its source. A turned auxiliary, including Anel de Ametista, cannot expose another activation before it readies. */if(auxiliary&&(unit.exhausted||unit.summoning))return false;/* Feiticeira Espectral has exactly one printed cost: remove X markers (minimum 1). Legacy activatedThisTurn flags belong to the old UI path and must not suppress this canonical, usage-keyed ability. */if(unit.page===80)return !!ability&&!used&&!unit.suffocated&&!unit.summoning&&markerAmount(unit)>=1;const compiled=localAbility?unit:canonicalUnit(unit);return !!ability&&!used&&!unit.suffocated&&canActivateCard(compiled,{energy:player.energy,reserve:player.reserve,life:player.life,heroId:player.heroId,heroLevel:player.level,topGrave:player.grave.at(-1),constantMarkers:[...player.board,...player.support,...(player.terrain?[player.terrain]:[])].reduce((sum,card)=>sum+markerAmount(card),0),hasSacrificeTarget:player.board.some(card=>card.uid!==unit.uid)})};
 const activeUnitEffect=(_player:Player,unit:Unit)=>unit.impacting?"IMPACTO":"";

function OriginalCard({card,controller,small=false,disabled=false,selected=false,targetClass="",activeEffect="",priority=false,draggable=false,onDragStart,onDragEnd,onClick,onActivate,activationDisabled=false,inspectable=true}:{card:CardDef|Unit;controller?:Player;small?:boolean;disabled?:boolean;selected?:boolean;targetClass?:string;activeEffect?:string;priority?:boolean;draggable?:boolean;onDragStart?:(e:React.DragEvent)=>void;onDragEnd?:()=>void;onClick?:()=>void;onActivate?:()=>void;activationDisabled?:boolean;inspectable?:boolean}){
 const unit="uid" in card?card:undefined,displayName=unit&&controller?effectiveCreatureName(controller,unit):card.name,modifiers=unit?statModifiers(controller,unit):{atk:0,hp:0},liveAttack=unit?currentAtk(unit,controller):0,liveVitality=unit?currentHp(unit,controller):0,shownCost=!unit&&controller?effectiveCost(card,controller):card.cost,costChanged=shownCost!==card.cost,markerCount=unit?markerAmount(unit):0,activatable=!!unit&&hasActivatableUnitEffect(unit),markerGatedActivation=unit?.page===80||unit?.page===134,showActivation=activatable&&(!markerGatedActivation||markerCount>0);
 /* Board cards expose semantic visual states. A turned card preserves its
    orientation and receives the VIRADA status tag; buffs and debuffs use separate classes. */
 const negativeState=unit?.suffocated?"status-suffocated":unit?.stunned?"status-stunned":unit?.frozen?"status-frozen":unit?.immobilized?"status-immobilized":"",tessaliaCommander=!!unit&&controller?.heroId==="tessalia"&&unit.type==="Criatura"&&unit.slot===2;
 const elementalReady=activeEffect.startsWith("CADEIA:"),positiveState=!!unit&&!negativeState&&(modifiers.atk>0||modifiers.hp>0||!!activeEffect),magicBarrier=!!unit&&hasKeyword(controller,unit,"Barreira Mágica");
 const negativeStatuses=unit?[tessaliaCommander?{key:"Comandante",icon:"♛",tip:"Comandante: sua criatura central é o Comandante."}:null,unit.summoning?{key:"Enjoo",icon:"◷",tip:"Enjoo de invocação: esta carta não pode atacar nem usar efeitos ativáveis no turno em que entra em campo."}:null,unit.suffocated?{key:"Sufocado",icon:"⊘",tip:"Sufocado: efeitos e palavras-chave positivas desta carta ficam ignorados."}:null,unit.frozen?{key:"Congelado",icon:"❄",tip:"Congelado: a Ofensividade desta criatura fica 0 enquanto o efeito durar."}:null,unit.stunned?{key:"Atordoado",icon:"✹",tip:"Atordoado: esta criatura não pode atacar nem defender."}:null,unit.immobilized?{key:"Imobilizado",icon:"⌁",tip:"Imobilizado: esta criatura não desvira normalmente na próxima manutenção."}:null,(modifiers.atk<0||modifiers.hp<0)?{key:"Enfraquecido",icon:"↓",tip:"Enfraquecido: esta carta está sofrendo redução de atributos."}:null].filter((status):status is {key:string;icon:string;tip:string}=>!!status):[];const negativeKeywordKeys=new Set(["Sufocado","Congelado","Atordoado","Imobilizado"]);const liveKeywordNames=unit?[...new Set(intrinsicKeywordNames(unit).map(tag=>keywordEntry(tag)?.key).filter((tag):tag is string=>!!tag&&!negativeKeywordKeys.has(tag)))]:[];
 return <span className={`card-frame ${small?"is-small":""} ${tessaliaCommander?"tessalia-commander-frame":""}`} data-unit-id={unit?.uid}><button className={`original-card ${small?"is-small":""} ${disabled?"is-disabled":""} ${selected?"is-selected":""} ${card.imageCard?"is-image-card":""} ${activeEffect?"effect-active":""} ${elementalReady?"effect-elemental":""} ${positiveState?"effect-positive":""} ${negativeState?"effect-negative "+negativeState:""} ${unit?.exhausted?"is-exhausted":""} ${unit?.summoning?"summoning-sick":""} ${unit?.impacting?"is-impacting":""} ${magicBarrier?"has-magic-barrier":""} ${targetClass}`} disabled={disabled&&!inspectable} aria-disabled={disabled||undefined} draggable={draggable&&!disabled} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={event=>{event.stopPropagation();const interactionClick=!disabled&&!!onClick&&(!inspectable||!!targetClass.trim());if(interactionClick)onClick?.()}} aria-label={displayName} data-active-effect={activeEffect||undefined} data-card-preview="true" data-card-inspectable={inspectable?"true":"false"} data-card-id={card.id} data-card-page={card.page} data-card-name={displayName} data-card-subtypes={(card.subtypes||[]).join(" · ")||undefined}>
 <RemoteCardArt page={card.page} name={card.name} priority={priority}/>{costChanged&&<span className={`effective-cost ${shownCost<card.cost?"discounted":"modified"}`} title={`Custo base ${card.cost}; custo atual ${shownCost}`}>{shownCost}</span>}{!unit&&card.revealed&&<span className="revealed-badge" title="Carta revelada: ambos os jogadores podem vê-la" aria-label="Carta revelada">◉</span>}{unit&&<>{unit.type==="Criatura"&&<><span className={`live-atk ${modifiers.atk>0?"is-buffed":modifiers.atk<0||unit.frozen?"is-weakened":""}`}>{liveAttack}</span><span className={`live-hp ${modifiers.hp>0?"is-buffed":modifiers.hp<0?"is-weakened":""}`}>{liveVitality}</span></>}{unit.summoning&&<i className="summoning-sickness-badge summoning-sickness-icon" title="Enjoo de invocação: esta carta não pode atacar nem usar efeitos ativáveis no turno em que entra em campo." aria-label="Enjoo de invocação">◷</i>}{(((unit.exhausted&&!activeEffect&&!unit.impacting)||unit.frozen||unit.stunned||unit.suffocated||unit.immobilized))&&<i className="status">{unit.suffocated?"SUFOCADA":unit.stunned?"ATORDOADA":unit.frozen?"CONGELADA":unit.immobilized?"IMOBILIZADA":"VIRADA"}</i>}</>}
  <span className="card-tooltip" aria-hidden="true"><b>{displayName}</b><em>{card.type} · custo {shownCost}{card.type==="Criatura"?` · ${unit?liveAttack:card.atk??0}/${unit?liveVitality:card.hp??0}`:""}</em><RichCardText text={card.text}/>{card.tags.length>0&&<span className="keyword-list">{card.tags.map(tag=><KeywordBadge name={tag} key={tag}/>)}</span>}</span>
 </button>{card.collectionQuantity&&<i className="collection-copy-count" title={`${card.collectionQuantity} cópias desta carta`} aria-label={`${card.collectionQuantity} cópias`}>×{card.collectionQuantity}</i>}{unit&&negativeStatuses.length>0?<span className="field-negative-statuses" aria-label={negativeStatuses.map(status=>status.key).join(", ")}>{negativeStatuses.map(status=><i key={status.key} data-status={status.key} title={status.tip} aria-label={status.tip}>{status.icon}</i>)}</span>:null}{unit&&liveKeywordNames.length>0?<span className="field-keywords" style={{"--keyword-icon-size":`${Math.max(9,16-(liveKeywordNames.length-1)*1.15)}px`,"--keyword-gap":`${Math.max(1,4-(liveKeywordNames.length-1)*.45)}px`} as React.CSSProperties} data-keywords={liveKeywordNames.join(" · ")} aria-label={`Palavras-chave: ${liveKeywordNames.join(", ")}`}>{liveKeywordNames.map(name=><i key={name} data-keyword={name} aria-hidden="true">{keywordIcons[name]||"◆"}</i>)}</span>:null}{markerCount>0&&<i className="card-frame-marker" title={`${markerCount} marcador(es)`}>+{markerCount}</i>}{showActivation&&<button className="card-frame-activation" disabled={activationDisabled||!onActivate} onClick={event=>{event.preventDefault();event.stopPropagation();if(!activationDisabled)onActivate?.()}} title={activationDisabled?"Efeito já usado neste turno ou condição ainda não cumprida.":unit?.page===134?`Consumir ${markerCount} marcador(es) e recuperar ${markerCount} de vida.`:"Ativar efeito desta carta."}>⚡</button>}</span>
}

const effectTheme=(card:CardDef|undefined,target:CardDef|undefined,kind:VisualFx["kind"],label:string,detail:string):VisualFx["theme"]=>{
 const deck=card&&deckDefs.find(entry=>card.page===entry.heroPage||(card.page>=entry.start&&card.page<=entry.end));
 const identity=cleanName(`${deck?.faction||""} ${deck?.style||""} ${card?.name||""} ${card?.text||""} ${(card?.tags||[]).join(" ")} ${(card?.subtypes||[]).join(" ")} ${target?.name||""} ${(target?.subtypes||[]).join(" ")} ${label} ${detail}`);
 if(/vampir|sangue|vida|sacrific|nox|cobra dor/.test(identity))return"blood";
 if(/dragao|dracon/.test(identity))return"dragon";
 if(/goblin|tranqueira|megatanque|fura fila/.test(identity))return"goblin";
 if(/recruta|comandante|ordem|vigilia/.test(identity))return"recruit";
 if(/divin|sagrado|cura|restaur/.test(identity))return"divine";
 if(/gato|natureza|floresta|planta|terreno/.test(identity))return"nature";
 if(/caos|peste|veneno|corrup/.test(identity))return"chaos";
 if(/imperio|disciplina|soldado/.test(identity))return"order";
 if(/element|feitico|arcano|magia|orbe/.test(identity)||kind==="spell")return"arcane";
 return"neutral";
};
const buffEffectLabel=(source:CardDef,target:CardDef,attack:number,health:number)=>{
 const stat=attack&&health?"PODER E VIGOR":attack?"PODER OFENSIVO":"VIGOR";
 return({blood:`PACTO DE SANGUE · ${stat}`,dragon:`ÍMPETO DRACÔNICO · ${stat}`,goblin:`ENGENHO GOBLIN · ${stat}`,recruit:`FORMAÇÃO DA ORDEM · ${stat}`,divine:`BÊNÇÃO DIVINA · ${stat}`,nature:`FLORAÇÃO · ${stat}`,arcane:`INFUSÃO ARCANA · ${stat}`,chaos:`MUTAÇÃO DO CAOS · ${stat}`,order:`DISCIPLINA · ${stat}`,neutral:`REFORÇO · ${stat}`} as Record<VisualFx["theme"],string>)[effectTheme(source,target,"ability","","")];
};

const evolutionMilestoneText=(deck:DeckDef,target:number)=>({
 gimble:`Controle ${target} Dragões simultaneamente no campo.`,
 goblin:`Jogue ${target} cartas durante o mesmo turno.`,
 uruk:`Conjure ${target} feitiços ao longo da partida.`,
 tifon:`Registre ${target} mortes de criaturas aliadas.`,
 saymon:`Acumule ${target} eventos de perda de vida no turno atual.`,
 tessalia:`Declare ${target} ataques com a criatura Comandante central.`,
 quarion:`Controle ${target} criaturas de nomes diferentes com Primeiro Ato.`,
 rasmus:`Controle ${target} Gatos simultaneamente em seus campos.`,
 ngoro:`Acumule ${target} Pistas disponíveis.`,
 zayan:`Controle ${target} constantes sem texto de efeito.`,
 natureza:`Acumule ${target} marcadores de ação em suas constantes.`,
}[deck.id]);

function HeroGuide({deck}:{deck:DeckDef}){
 const targets=(deck.requirement.match(/\d+/g)||[]).map(Number);
 return <section className="hero-guide" style={{"--deck":deck.color} as React.CSSProperties}>
  <header><h3>{deck.name}</h3><p>{deck.faction}</p></header>
  <section className="hero-evolution-guide"><div className="hero-guide-title"><i>✦</i><span><small>CONDIÇÃO DE EVOLUÇÃO</small><b>Como subir de nível</b></span></div><p>{evolutionCriterionSummary(deck.id)}</p><ol>{targets.map((target,index)=><li key={target}><span>NÍVEL {index+2}</span><b>{evolutionMilestoneText(deck,target)}</b></li>)}</ol></section>
  <section className="hero-abilities-guide"><div className="hero-guide-title"><i>◆</i><span><small>HABILIDADES</small><b>Poderes liberados por nível</b></span></div><div>{deck.abilities.map((ability,index)=>{const active=isActiveAbility(deck.id,index);return <article key={ability}><span>{index+1}</span><div><p><em className={active?"active":"passive"}>{active?"Ativa":"Passiva"}</em>{deck.id==="uruk"&&index===0?<><span>Fim do turno: ative o elemento do último feitiço.</span><span className="uruk-element-list">{(["Fogo","Terra","Água","Ar"] as const).map(element=><span className="uruk-element-badge" data-tip={{Fogo:"Cause 1 de dano ao alvo.",Terra:"Compre 1 carta.",Água:"Recupere 1 de vida.",Ar:"Compre 1 carta."}[element]} title={{Fogo:"Cause 1 de dano ao alvo.",Terra:"Compre 1 carta.",Água:"Recupere 1 de vida.",Ar:"Compre 1 carta."}[element]} key={element}>{element}</span>)}</span></>:<span>{ability.replace(/^[IVX]+\s*·\s*/,"")}</span>}</p></div></article>})}</div></section>
 </section>
}

const createDefaultUserDecks=()=>Object.fromEntries(deckDefs.map(deck=>[deck.id,defaultUserDeck(deck.id,cards,deck.name)])) as Record<DeckId,UserDeck>;
const deckValidationLabel=(error:string)=>error.includes("exactly 49")?"o Deck Principal precisa ter exatamente 49 cartas":error.includes("copy")||error.includes("quantity")?"cada carta pode ter no máximo 3 cópias":error.includes("identity")?"há carta fora da identidade deste herói":error.includes("unavailable")?"há carta indisponível na lista":error.includes("extra deck")?"o Deck Extra contém uma carta inválida":error.includes("duplicate")?"há entradas duplicadas":error;

export default function Home(){
 const [screen,setScreen]=useState<Screen>("menu");const[mode,setMode]=useState<"bot"|"online">("bot");const[mine,setMine]=useState<DeckId>("gimble");const[enemy,setEnemy]=useState<DeckId>("goblin");const[difficulty,setDifficulty]=useState("Normal");const[game,setGame]=useState<Game|null>(null);const[maintenanceOpen,setMaintenanceOpen]=useState(false);const[showLog,setShowLog]=useState(false);const[showInspector,setShowInspector]=useState<CardDef|null>(null);const[targeting,setTargeting]=useState<Targeting|null>(null);const[imageChoice,setImageChoice]=useState<ImageChoice|null>(null);const[cafeChoice,setCafeChoice]=useState<number|null>(null);const[responseWindow,setResponseWindow]=useState<PendingResponse|null>(null);const[combatAction,setCombatAction]=useState<CombatAction|null>(null);const[aiAttackQueue,setAiAttackQueue]=useState<string[]>([]);const[visualFx,setVisualFx]=useState<VisualFx|null>(null);const[confirmSurrender,setConfirmSurrender]=useState(false);const[extraView,setExtraView]=useState<{kind?:"extra"|"grave";title:string;cards:CardDef[]}|null>(null);const[searchChoice,setSearchChoice]=useState<SearchRequest|null>(null);const[shufflingDeck,setShufflingDeck]=useState<0|1|null>(null);const[dragging,setDragging]=useState<{index:number;type:CardType}|null>(null);
const [collectionQuery,setCollectionQuery]=useState("");const [collectionType,setCollectionType]=useState<"Todas"|CardType>("Todas");const deferredCollectionQuery=useDeferredValue(collectionQuery);
const userDecks=useMemo<Record<DeckId,UserDeck>>(()=>createDefaultUserDecks(),[]);
const [engineTargetSelection,setEngineTargetSelection]=useState<string[]>([]);
const [engineChoiceIndex,setEngineChoiceIndex]=useState<number|null>(null);
const [repositionSeconds,setRepositionSeconds]=useState(30);const aiRepositionHandledRef=useRef<string>("");
useEffect(()=>{const inspect=(event:Event)=>{const detail=(event as CustomEvent<Partial<CardDef>>).detail,page=Number(detail?.page),printed=cards.find(card=>card.page===page);if(printed)setShowInspector(printed)};window.addEventListener("hemsfell:inspect-card",inspect);return()=>window.removeEventListener("hemsfell:inspect-card",inspect)},[]);
// Online room state
const [roomId,setRoomId]=useState<string|null>(null);
const [roomLink,setRoomLink]=useState<string|null>(null);
const [roomInfo,setRoomInfo]=useState<any|null>(null);
const [isHost,setIsHost]=useState(false);
const [roomToken,setRoomToken]=useState<string|null>(null);
const [inviteRoomId,setInviteRoomId]=useState<string|null>(null);
const [invitePreview,setInvitePreview]=useState<any|null>(null);
const [roomError,setRoomError]=useState("");
const [activeOnlineSession,setActiveOnlineSession]=useState<OnlineSession|null>(null);
const [sessionRecoveryPending,setSessionRecoveryPending]=useState(true);
const [settings,setSettings]=useState<MatchSettings>({startingLife:30,responseSeconds:30,turnSeconds:120});
const timeoutSentRef=useRef("");
const pollRef = useRef<number|undefined>(undefined);
const pollVisibilityCleanupRef=useRef<(()=>void)|null>(null);
const pollGenerationRef = useRef(0);
const roomRevisionRef=useRef(-1);
const syncQueueRef=useRef<Promise<void>>(Promise.resolve());
const currentGameRef=useRef<Game|null>(null);
const [onlineCommandPending,setOnlineCommandPending]=useState(false);
const [lobbyActionPending,setLobbyActionPending]=useState(false);
const [joinPending,setJoinPending]=useState(false);
const [createRoomPending,setCreateRoomPending]=useState(false);
const [mulliganActionPending,setMulliganActionPending]=useState(false);
const [rematchActionPending,setRematchActionPending]=useState(false);
const onlineCommandFlightsRef=useRef<Map<string,Promise<boolean>>>(new Map());
const joinRoomFlightRef=useRef<Promise<void>|null>(null);
const createRoomFlightRef=useRef<Promise<void>|null>(null);
const damageUiSnapshotRef=useRef<{life:[number,number];damage:Record<string,number>}|null>(null);
const mulliganPendingRef=useRef(false);
const [presentationBusy,setPresentationBusy]=useState(false);
useEffect(()=>{const sync=()=>setPresentationBusy(!!(window as Window&{__hemsfellPresentationBusy?:boolean}).__hemsfellPresentationBusy);window.addEventListener("hemsfell:presentation-busy",sync);window.addEventListener("hemsfell:presentation-idle",sync);sync();return()=>{window.removeEventListener("hemsfell:presentation-busy",sync);window.removeEventListener("hemsfell:presentation-idle",sync)}},[]);
/* Suppress accidental duplicate announcements from the same resolution. Explicit
   copy effects opt in to repetition through the final showFx argument. */
const visualFxDedupeRef=useRef<Map<string,number>>(new Map());
const visualFxContextRef=useRef<Map<string,number>>(new Map());

/* The local player is always index 0. The server stores host-first state, so the
   guest mirrors ownership while keeping every card/creature uid stable. */
const mirrorOnlineGame=(source:Game):Game=>{
 const mirrored=structuredClone(source);
 mirrored.players=[structuredClone(source.players[1]),structuredClone(source.players[0])];
 mirrored.active=source.active===0?1:0;
 mirrored.winner=source.winner===null?null:(source.winner===0?1:0);
 if(source.combatAction) mirrored.combatAction={...structuredClone(source.combatAction),attackerOwner:(source.combatAction.attackerOwner===0?1:0)};
 if(source.pendingResponse) mirrored.pendingResponse={...source.pendingResponse,responder:(source.pendingResponse.responder===0?1:0),actor:(source.pendingResponse.actor===0?1:0)};
 // These structures contain player indexes too. Leaving them canonical makes
 // the guest render a decision/reposition belonging to the wrong player.
 if(source.pendingAction) mirrored.pendingAction={...structuredClone(source.pendingAction),owner:typeof source.pendingAction.owner==='number'?(source.pendingAction.owner===0?1:0):source.pendingAction.owner};
 if(source.priorityStack) mirrored.priorityStack=source.priorityStack.map(frame=>({...structuredClone(frame),actor:typeof frame.actor==="number"?(frame.actor===0?1:0):frame.actor,command:frame.command?{...structuredClone(frame.command),owner:typeof frame.command.owner==="number"?(frame.command.owner===0?1:0):frame.command.owner}:frame.command}));
 if(source.pendingDecision){
   mirrored.pendingDecision={...structuredClone(source.pendingDecision),owner:source.pendingDecision.owner===0?1:0};
   if(mirrored.pendingDecision.context&&typeof mirrored.pendingDecision.context==='object'){
     const context={...mirrored.pendingDecision.context};
     if(typeof context.owner==='number')context.owner=context.owner===0?1:0;
     if(typeof context.decisionOwner==='number')context.decisionOwner=context.decisionOwner===0?1:0;
     mirrored.pendingDecision.context=context;
   }
   if(typeof mirrored.pendingDecision.effect?.targetOwner==='number') mirrored.pendingDecision.effect.targetOwner=mirrored.pendingDecision.effect.targetOwner===0?1:0;
 }
 if(source.pendingReposition){
   mirrored.pendingReposition={...structuredClone(source.pendingReposition),owners:source.pendingReposition.owners.map(owner=>owner===0?1:0),confirmed:source.pendingReposition.confirmed.map(owner=>owner===0?1:0),activeOwner:typeof source.pendingReposition.activeOwner==="number"?(source.pendingReposition.activeOwner===0?1:0):source.pendingReposition.activeOwner};
 }
 return mirrored;
};
const fromCanonicalGame=(source:Game)=>isHost?structuredClone(source):mirrorOnlineGame(source);
const announceOnlineSnapshot=(sessionId:string,hostRole:boolean,snapshot:any)=>window.dispatchEvent(new CustomEvent("hemsfell:online-room-snapshot",{detail:{session:{id:sessionId,isHost:hostRole},room:snapshot}}));

const stopPolling = ()=>{pollGenerationRef.current++;if(pollRef.current){window.clearTimeout(pollRef.current);pollRef.current=undefined}pollVisibilityCleanupRef.current?.();pollVisibilityCleanupRef.current=null};
const roomUrl=(id:string)=>`${location.origin}/?room=${id}`;
const rememberOnlineSession=(session:OnlineSession)=>{saveOnlineSession(localStorage,session);setActiveOnlineSession(session);history.replaceState({},"",`/?room=${encodeURIComponent(session.roomId)}`)};
const forgetOnlineSession=(id?:string)=>{clearOnlineSession(localStorage,id);setActiveOnlineSession(null);history.replaceState({},"",location.pathname)};
const signalOnlineDeparture=(id=roomId,token=roomToken,status=roomInfo?.status)=>{if(!id||!token)return;const body=JSON.stringify({action:status==="finished"?"leave":"disconnect",token});if(!navigator.sendBeacon?.(`/api/rooms/${id}`,new Blob([body],{type:"application/json"}))){void fetch(`/api/rooms/${id}`,{method:"POST",headers:{"content-type":"application/json"},body,keepalive:true})}};
const clearOnlineMatch=()=>{stopPolling();if(roomId)forgetOnlineSession(roomId);setRoomId(null);setRoomToken(null);setRoomLink(null);setRoomInfo(null);setInviteRoomId(null);setInvitePreview(null);setGame(null);currentGameRef.current=null;setResponseWindow(null);setCombatAction(null);setRematchActionPending(false);setMode("bot");setScreen("menu")};
const leaveOnlineMatch=()=>{signalOnlineDeparture();clearOnlineMatch()};
const openOnlineSnapshot=(data:any,session:OnlineSession)=>{
  setMode("online");setRoomId(session.roomId);setRoomToken(session.token);setIsHost(session.isHost);setRoomLink(roomUrl(session.roomId));setRoomInfo(data);setSettings(data.settings??settings);roomRevisionRef.current=data.revision??0;
  if(data.game){const oriented=session.isHost?structuredClone(data.game):mirrorOnlineGame(data.game);currentGameRef.current=oriented;setGame(oriented);setResponseWindow(oriented.pendingResponse??null);setScreen("game")}else setScreen("setup");
};
const resumeOnlineSession=async(session:OnlineSession)=>{
  setSessionRecoveryPending(true);setRoomError("");rememberOnlineSession(session);
  try{
    const response=await fetch(`/api/rooms/${session.roomId}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"resume",token:session.token})});
    const data=await response.json();
    if(!response.ok||data.status==="finished"){forgetOnlineSession(session.roomId);setRoomId(null);setRoomToken(null);setRoomInfo(null);setGame(null);setMode("bot");setScreen("menu");if(!response.ok)setRoomError(data?.error||"A partida online não está mais disponível.");return false}
    openOnlineSnapshot(data,session);pollRoom(session.roomId,session.token,session.isHost);return true;
  }catch(error){setRoomError("Reconectando à sala…");openOnlineSnapshot({},session);pollRoom(session.roomId,session.token,session.isHost);return false}
  finally{setSessionRecoveryPending(false)}
};

/** Create a room with a compact, readable request boundary. */
const createRoom = async () => {
  if(createRoomFlightRef.current)return createRoomFlightRef.current;
  setCreateRoomPending(true);setRoomError("");
  const task=(async()=>{try {
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "failed");

    const id = data.id as string;
    rememberOnlineSession({roomId:id,token:data.token,isHost:true});
    setMode("online");
    setRoomId(id);
    setRoomToken(data.token);
    setRoomLink(roomUrl(id));
    setRoomInfo(data);
    setIsHost(true);
    roomRevisionRef.current = data.revision ?? 0;
    setScreen("setup");
    pollRoom(id, data.token, true);
  } catch (error) {
    console.error("Could not create multiplayer room", error);
    setRoomError(error instanceof Error ? error.message : "Não foi possível criar a sala.");
  }})().finally(()=>{if(createRoomFlightRef.current===task)createRoomFlightRef.current=null;setCreateRoomPending(false)});
  createRoomFlightRef.current=task;return task;
};

const joinRoomWithPost = (id:string)=>{
    if(joinRoomFlightRef.current)return joinRoomFlightRef.current;
    const joinRequestId=crypto.randomUUID();setJoinPending(true);setRoomError("");
    const task=(async()=>{
      let lastError:unknown=new Error("Não foi possível entrar na sala.");
      for(let attempt=0;attempt<3;attempt++){
        try{
          const res=await fetch(`/api/rooms/${id}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"join",joinRequestId})});
          const data=await res.json();
          if(res.ok){rememberOnlineSession({roomId:id,token:data.token,isHost:false});setMode("online");setRoomId(id);setInviteRoomId(null);setRoomToken(data.token);setRoomLink(roomUrl(id));setRoomInfo(data);setSettings(data.settings??settings);setIsHost(false);roomRevisionRef.current=data.revision??0;setScreen("setup");pollRoom(id,data.token,false);return}
          if(res.status===409&&data?.error==="stale revision"){lastError=new Error("A sala mudou enquanto o convite era aceito.");continue}
          if(res.status===409&&data?.error==="room full")throw new Error("A sala já está cheia.");
          lastError=new Error(data?.error||"Não foi possível entrar na sala.");
          if(res.status<500)throw lastError;
        }catch(error){lastError=error;if(error instanceof Error&&error.message==="A sala já está cheia.")throw error}
      }
      throw lastError;
    })().catch(error=>{setRoomError(error instanceof Error?error.message:"Não foi possível entrar na sala.")}).finally(()=>{if(joinRoomFlightRef.current===task)joinRoomFlightRef.current=null;setJoinPending(false)});
    joinRoomFlightRef.current=task;return task;
};

const selectHeroInRoom = async (heroId:string)=>{
    if(!roomId||!roomToken||lobbyActionPending)return;
    const candidate=userDecks[heroId as DeckId],validation=validateUserDeck(candidate,cards);
    if(!validation.ok||!validation.deck){setRoomError(`Deck inválido: ${validation.errors.slice(0,2).map(deckValidationLabel).join(" · ")}`);return}
    setLobbyActionPending(true);setRoomError("");
    const selectRequestId=crypto.randomUUID();
    try{await roomAction("select",{heroId,userDeck:validation.deck,locked:true,selectRequestId})}
    finally{setLobbyActionPending(false)}
};

/* Online milestones use the same authoritative presentation transaction as local play.
   Keeping this hook as a no-op preserves the call sites without scheduling a second theatre. */
const queueOnlineSnapshotFx=(_previous:Game|null,_next:Game)=>{};
const applyRoomSnapshot=(data:any)=>{const incomingRevision=Number(data?.revision??-1);if(Number.isFinite(incomingRevision)&&incomingRevision<roomRevisionRef.current)return false;if(data.status==="closed"){clearOnlineMatch();setRoomError("A partida online foi encerrada.");return true}setRoomInfo(data);if(roomId)announceOnlineSnapshot(roomId,isHost,data);roomRevisionRef.current=data.revision??roomRevisionRef.current;if(data.game){const next=fromCanonicalGame(data.game),previous=currentGameRef.current;queueOnlineSnapshotFx(previous,next);currentGameRef.current=next;setGame(next);setResponseWindow(next.pendingResponse??null);setScreen("game")}return true};
const roomAction=(action:string,extra:Record<string,unknown>={})=>{
 if(!roomId||!roomToken)return Promise.resolve(null);
 const execute=async(staleRetries=0,networkRetries=0):Promise<any>=>{try{
  const payload={action,token:roomToken,...extra,...(action==="command"?{baseRevision:roomRevisionRef.current}:{})};
  const res=await fetch(`/api/rooms/${roomId}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  const data=await res.json();
  const staleRevision=res.status===409&&data?.error==="stale revision";
  const retryableStale=staleRevision&&(action==="command"||action==="choose_start"||action==="select"||action==="mulligan"||action==="rematch");
  if(retryableStale){applyRoomSnapshot(data);const participant=isHost?data?.host:data?.guest;if(action==="select"&&participant?.deckLocked&&participant?.heroId===extra.heroId)return data;if(action==="choose_start"&&["mulligan","started","finished"].includes(data?.status))return data;if(staleRetries<3){await new Promise(resolve=>window.setTimeout(resolve,0));return execute(staleRetries+1,networkRetries)}}
  if(res.status>=500&&networkRetries<2){await new Promise(resolve=>window.setTimeout(resolve,150*(networkRetries+1)));return execute(staleRetries,networkRetries+1)}
  const requestedCommand=extra.command as Record<string,unknown>|undefined;
  const obsoleteAutomaticPriorityPass=action==="command"&&requestedCommand?.type==="passPriority"&&requestedCommand.auto===true&&["no-priority-window","not-your-priority"].includes(String(data?.error||""));
  if(!res.ok&&obsoleteAutomaticPriorityPass){applyRoomSnapshot(data);setRoomError("");return data}
  if(!res.ok){setRoomError(data?.error||"A sala recusou a ação.");return null}
  setRoomError("");applyRoomSnapshot(data);return data;
 }catch(error){if(networkRetries<2){await new Promise(resolve=>window.setTimeout(resolve,150*(networkRetries+1)));return execute(staleRetries,networkRetries+1)}throw error}
 };
 const task=syncQueueRef.current.then(()=>execute()).catch(()=>{setRoomError("Conexão instável. A ação será reconciliada com a sala.");return null});
 syncQueueRef.current=task.then(()=>undefined,()=>undefined);
 return task;
};
const chooseStarter=async(startSelf:boolean)=>{if(lobbyActionPending)return;setLobbyActionPending(true);const chooseStartRequestId=crypto.randomUUID();try{await roomAction("choose_start",{startSelf,chooseStartRequestId})}finally{setLobbyActionPending(false)}};
const confirmMulligan=async(keep:boolean)=>{if(mulliganPendingRef.current)return;mulliganPendingRef.current=true;setMulliganActionPending(true);const mulliganRequestId=crypto.randomUUID();try{await roomAction("mulligan",{keep,mulliganRequestId})}finally{mulliganPendingRef.current=false;setMulliganActionPending(false)}};
const requestOnlineRematch=async()=>{if(rematchActionPending||roomInfo?.status!=="finished")return;setRematchActionPending(true);const rematchRequestId=crypto.randomUUID();try{await roomAction("rematch",{rematchRequestId})}finally{setRematchActionPending(false)}};

const pollRoom = (id:string,token:string,hostRole:boolean)=>{
    stopPolling();const generation=++pollGenerationRef.current;
    let inFlight=false;
    const nextDelay=()=>document.hidden?5000:currentGameRef.current?.pendingResponse?450:currentGameRef.current?800:1800;
    const fn = async ()=>{if(inFlight||generation!==pollGenerationRef.current)return;inFlight=true;try{ const res = await fetch(`/api/rooms/${id}`,{cache:"no-store",headers:{authorization:`Bearer ${token}`}}); if(!res.ok) return; const r = await res.json();setRoomError(current=>current==="Reconectando à sala…"?"":current);const incomingRevision=Number(r.revision??-1);if(incomingRevision<=roomRevisionRef.current)return;if(r.status==="closed"){clearOnlineMatch();setRoomError("A partida online foi encerrada.");return}announceOnlineSnapshot(id,hostRole,r); setRoomInfo(r);setSettings(r.settings??settings);roomRevisionRef.current=incomingRevision;if(r.game){
            const oriented=hostRole?structuredClone(r.game):mirrorOnlineGame(r.game),previous=currentGameRef.current;queueOnlineSnapshotFx(previous,oriented);currentGameRef.current=oriented;setResponseWindow(oriented.pendingResponse??null);setScreen('game');setGame(oriented); }
    }catch(e){setRoomError("Reconectando à sala…")}finally{inFlight=false;if(generation===pollGenerationRef.current)pollRef.current=window.setTimeout(fn,nextDelay())} };
    const resumeVisible=()=>{if(document.hidden||generation!==pollGenerationRef.current)return;if(pollRef.current)window.clearTimeout(pollRef.current);pollRef.current=undefined;void fn()};
    document.addEventListener("visibilitychange",resumeVisible,{passive:true});
    pollVisibilityCleanupRef.current=()=>document.removeEventListener("visibilitychange",resumeVisible);
    void fn();
};

useEffect(()=>{
    const preferredRoomId=new URLSearchParams(location.search).get("room")||undefined;
    const session=loadOnlineSession(localStorage,preferredRoomId) as OnlineSession|null;
    if(session){void resumeOnlineSession(session)}else if(preferredRoomId){setMode("online");setScreen("setup");setInviteRoomId(preferredRoomId);setSessionRecoveryPending(false);fetch(`/api/rooms/${preferredRoomId}`).then(res=>res.json()).then(data=>{if(data.error)throw new Error(data.error);setInvitePreview(data);setSettings(data.settings??settings)}).catch(error=>setRoomError(error instanceof Error&&error.message?`Não foi possível carregar o convite: ${error.message}`:"A sala não existe ou o armazenamento está indisponível."))}else setSessionRecoveryPending(false);
    return ()=>stopPolling();
},[]);
useEffect(()=>{
 if(mode!=="online"||!roomId||!roomToken)return;
 const notifyDisconnect=()=>signalOnlineDeparture(roomId,roomToken,roomInfo?.status);
 window.addEventListener("pagehide",notifyDisconnect);
 return()=>window.removeEventListener("pagehide",notifyDisconnect);
},[mode,roomId,roomToken,roomInfo?.status]);
useEffect(()=>{if(mode!=="online"||!roomId||!roomToken||!game)return;const deadline=game.pendingResponse?.deadline??game.turnDeadline;if(!deadline)return;const key=`${game.round}-${game.pendingResponse?.action??"turn"}-${deadline}`;const expire=()=>{if(timeoutSentRef.current===key)return;timeoutSentRef.current=key;void roomAction("timeout")};const delay=deadline-Date.now();if(delay<=0){expire();return}const timer=window.setTimeout(expire,delay+25);return()=>window.clearTimeout(timer)},[mode,roomId,roomToken,game?.round,game?.pendingResponse?.action,game?.pendingResponse?.deadline,game?.turnDeadline]);
useEffect(()=>{if(mode!=="online"||roomInfo?.status!=="mulligan")return;const participant=isHost?roomInfo?.host:roomInfo?.guest,deadline=participant?.mulliganDeadline;if(participant?.mulliganDone||!deadline)return;const key=`mulligan-${deadline}`;const expire=()=>{if(timeoutSentRef.current===key)return;timeoutSentRef.current=key;void roomAction("timeout")};const delay=deadline-Date.now();if(delay<=0){expire();return}const timer=window.setTimeout(expire,delay+25);return()=>window.clearTimeout(timer)},[mode,isHost,roomInfo?.status,roomInfo?.host?.mulliganDone,roomInfo?.host?.mulliganDeadline,roomInfo?.guest?.mulliganDone,roomInfo?.guest?.mulliganDeadline]);
 /* One centralized life-loss dispatcher keeps damage/payment triggers consistent across cards and heroes. */
 const resolveLifeLossTriggers=(g:Game,before:[number,number])=>{
  g.players.forEach((p,index)=>{
   const loss=Math.max(0,before[index]-p.life);if(!loss)return;
   const foe=g.players[index===0?1:0] as Player;
   if(p.heroId==="saymon"){p.heroXP+=1;log(g,"Saymon recebeu 1 marcador por perder vida.","effect")}
   if(g.active===index)p.board.filter(unit=>unit.page===131&&!unit.suffocated).forEach(unit=>{unit.temporaryAtk=(unit.temporaryAtk||0)+1;log(g,`Discípulo de Sangue recebeu +1/+0 após perda de vida.`,"effect")});
   const castle=p.terrain?.page===148&&!p.terrain.suffocated?p.terrain:null;if(g.active===index&&castle){const key=`castelo-carmesim-${g.round}`,count=(p.abilityUses[key]||0)+1;p.abilityUses[key]=count;if(count===1){draw(g,p);log(g,"Castelo Carmesim: primeira perda de vida comprou 1 carta.","effect")}else if(count===2){log(g,"Castelo Carmesim: escolha um alvo para receber 2 de dano.","effect")}else if(count===3){p.life=Math.min(30,p.life+2);log(g,"Castelo Carmesim: terceira perda de vida restaurou 2.","heal")}else if(count>=4){p.life=Math.min(30,p.life+1);log(g,"Castelo Carmesim: perda adicional restaurou 1 de vida.","heal")}}
  })
 };
 const queueCafeDoTempoPlacement=(g:Game)=>{
  if(g.pendingDecision)return;
  const targetOwner=g.active;
  for(const owner of [0,1] as const){
   const source=g.players[owner].terrain?.page===212&&!g.players[owner].terrain?.suffocated?g.players[owner].terrain:null;if(!source)continue;
   const target=g.players[targetOwner],creatureSlots=Array.from({length:5},(_,slot)=>slot).filter(slot=>!target.board.some(unit=>unit.slot===slot));
   const supportSlots=g.players[owner].heroId==="rasmus"&&g.players[owner].level>=3?Array.from({length:5},(_,slot)=>slot).filter(slot=>!target.support.some(unit=>unit.slot===slot)):[];
   if(!creatureSlots.length&&!supportSlots.length)continue;
   g.pendingDecision={kind:"image-placement",owner,effect:{name:"Gato Multidimensional",targetOwner,creatureSlots,supportSlots},context:{owner,sourceId:source.uid,decisionOwner:owner},sourceName:"Café do Tempo"};return;
  }
 };
 const update=(fn:(g:Game)=>void)=>setGame(old=>{if(!old)return old;const g=structuredClone(old),before:[number,number]=[g.players[0].life,g.players[1].life],cruelDamageBefore=new Map(g.players.flatMap(player=>player.board.filter(unit=>unit.page===165).map(unit=>[unit.uid,Number(unit.damage||0)] as const)));fn(g);syncDynamicFieldCounts(g);g.players.forEach(player=>player.board.filter(unit=>unit.page===165&&!unit.suffocated).forEach(unit=>{if(Number(unit.damage||0)>Number(cruelDamageBefore.get(unit.uid)||0)){unit.modifiers||=[];unit.modifiers.push({attack:1,health:0,duration:"permanent",sourceId:`escudeiro-cruel:${unit.uid}:${g.events}`});log(g,`${unit.name} recebeu +1 de Ofensividade permanente após sofrer dano.`,"effect")}}));resolveLifeLossTriggers(g,before);removeDead(g,(owner,card)=>resolveText(g,owner,card));syncDynamicFieldCounts(g);removeDead(g,(owner,card)=>resolveText(g,owner,card));syncDynamicFieldCounts(g);g.players.forEach((p,i)=>{if(p.life<=0)g.winner=i===0?1:0});return g});
 const setSharedCombat=(action:CombatAction|null)=>{
  setCombatAction(action);
  // Combat animation/progress is local UI state. Persisting every transition
  // alongside pendingResponse caused queued snapshots to resurrect an already
  // passed priority window and alternate between defender/response modals.
 };
 const setSharedResponse=(response:PendingResponse|null,sharedAction:CombatAction|null=combatAction)=>{
  /* Online response/combat checkpoints come only from authoritative room snapshots.
     Local callers may animate, but must never manufacture or persist priority state. */
  if(mode==="online")return;
  const timed=response?{...response,deadline:response.deadline??Date.now()+(roomInfo?.settings?.responseSeconds??30)*1000}:null;
  setResponseWindow(timed);
  /* Bot priority must live in the authoritative game snapshot too. Keeping this
     only in responseWindow made the UI wait forever while the AI inspected a
     currentGameRef with no pendingResponse and therefore never passed. */
  /* Queue this mutation against React's latest game value instead of cloning
     currentGameRef synchronously. Actions such as hero evolution update the
     game and immediately open priority; cloning the ref here could restore the
     pre-action snapshot and silently undo the evolution. */
  setGame(old=>{if(!old)return old;const next=structuredClone(old);next.pendingResponse=timed?{...timed,passes:timed.passes??0}:null;next.combatAction=sharedAction;currentGameRef.current=next;return next});
 };
 useEffect(()=>{if(mode!=="online"||!game)return;/* Priority is interaction state, not presentation timing: expose the authoritative window immediately so pass/respond controls cannot lag behind server ownership. */setCombatAction(game.combatAction??null);setResponseWindow(game.pendingResponse??null)},[mode,game?.combatAction,game?.pendingResponse?.action,game?.pendingResponse?.deadline,game?.pendingResponse?.responder,game?.pendingResponse?.passes]);
 useEffect(()=>{currentGameRef.current=game},[game]);
 useEffect(()=>{if(!game){damageUiSnapshotRef.current=null;return}const units=[...game.players[0].board,...game.players[0].support,...(game.players[0].terrain?[game.players[0].terrain]:[]),...game.players[1].board,...game.players[1].support,...(game.players[1].terrain?[game.players[1].terrain]:[])],next={life:[game.players[0].life,game.players[1].life] as [number,number],damage:Object.fromEntries(units.map(unit=>[unit.uid,Number(unit.damage||0)]))},previous=damageUiSnapshotRef.current,presentationOwnsTransition=!!(window as Window&{__hemsfellPresentationBusy?:boolean}).__hemsfellPresentationBusy;const pulseDamageUi=(selector:string)=>{const node=document.querySelector<HTMLElement>(selector);if(!node)return;node.classList.remove("damage-hit");void node.offsetWidth;node.classList.add("damage-hit");window.setTimeout(()=>node.classList.remove("damage-hit"),540)};if(previous&&!presentationOwnsTransition){if(next.life[0]<previous.life[0])pulseDamageUi('[data-hero-role="ally"]');if(next.life[1]<previous.life[1])pulseDamageUi('[data-hero-role="enemy"]');for(const [uid,amount] of Object.entries(next.damage))if(amount>Number(previous.damage[uid]||0))pulseDamageUi(`[data-unit-id="${CSS.escape(uid)}"]`)}damageUiSnapshotRef.current=next},[game]);
 useEffect(()=>{if(game?.active!==0||game.phase!=="manutencao"||game.winner!==null)return;setResponseWindow(null);setCombatAction(null);setAiAttackQueue([]);setMaintenanceOpen(true)},[game?.active,game?.phase,game?.winner]);
 const me=game?.players[0],foe=game?.players[1];
 const matchArtPreloadRef=useRef<{signature:string;dispose:()=>void}|null>(null);
 useEffect(()=>{
  if(screen!=="game"||!game||game.winner!==null){matchArtPreloadRef.current?.dispose();matchArtPreloadRef.current=null;return}
  const signature=`${game.players[0].heroId}:${game.players[1].heroId}`;
  if(matchArtPreloadRef.current?.signature===signature)return;
  matchArtPreloadRef.current?.dispose();
  const plan=matchArtPreloadPlan(game);
  const heroAssetUrls=game.players.map(player=>heroPortraitSources[player.heroId as DeckId].src);
  matchArtPreloadRef.current={signature,dispose:preloadMatchCardArt({...plan,assetUrls:[MATCH_CARD_BACK_URL,...heroAssetUrls]})};
 },[screen,game]);
 useEffect(()=>()=>{matchArtPreloadRef.current?.dispose();matchArtPreloadRef.current=null},[]);
 const [visualFxQueue,setVisualFxQueue]=useState<VisualFx[]>([]);const [elementChoice,setElementChoice]=useState<{cardIndex:number;name:string}|null>(null);
 const begin=()=>{const mineValidation=validateUserDeck(userDecks[mine],cards),enemyValidation=validateUserDeck(userDecks[enemy],cards);if(!mineValidation.ok||!mineValidation.deck){setScreen("decks");return}void loadAdvancedAIRuntime().then(runtime=>runtime.resetAdvancedAI(1));setTargeting(null);setImageChoice(null);setCafeChoice(null);setResponseWindow(null);setCombatAction(null);setAiAttackQueue([]);setVisualFx(null);setVisualFxQueue([]);setConfirmSurrender(false);setExtraView(null);setSearchChoice(null);setShufflingDeck(null);setDragging(null);setElementChoice(null);setMaintenanceOpen(true);setGame(start(mine,enemy,0,30,mineValidation.deck,enemyValidation.ok?enemyValidation.deck:null));setScreen("game")};
 /* Card moments are deliberately serialized: a new spell or summon waits for the previous
    animation to finish instead of replacing it halfway through. */
 const showFx=(kind:VisualFx["kind"],label:string,detail:string,card?:CardDef,target?:CardDef,allowRepeat=false)=>{const signature=[kind,label,detail,card?.id||"",target?.id||""].join("|"),context=[kind,label,card?.id||""].join("|"),now=Date.now(),previous=visualFxDedupeRef.current.get(signature)||0,contextPrevious=visualFxContextRef.current.get(context)||0;if(!allowRepeat&&(now-previous<3600||now-contextPrevious<250))return;visualFxDedupeRef.current.set(signature,now);visualFxContextRef.current.set(context,now);setVisualFxQueue(queue=>[...queue,{id:uid(),kind,theme:effectTheme(card,target,kind,label,detail),label,detail,card,target}])};
 const animateDeckShuffle=(owner:0|1)=>{setShufflingDeck(owner)};
 const completeSearch=(selectedIds:string[])=>{if(!searchChoice)return;const request=searchChoice;update(g=>applySearchSelection(g,request,selectedIds));setSearchChoice(null);animateDeckShuffle(request.owner)};
 const doMaintenance=(two=false)=>{
  if(!game||game.active!==0||game.phase!=="manutencao"||game.winner!==null)return;
  if(mode==="online"){void runRulesCommand({type:"maintenanceChoice",drawTwo:two},0).then(accepted=>{if(accepted)setMaintenanceOpen(false)});return}
  update(g=>{
   const p=g.players[0];
   if(!p.deck.length){p.life=0;log(g,`${deckById(p.heroId).name} iniciou a Manutenção com o Deck vazio e perdeu a partida.`,"danger");return}
   p.board.forEach(u=>{u.damage=0;u.summoning=false;u.activatedThisTurn=false;u.attackedThisTurn=false;u.attacksThisTurn=0;u.defenseUses=0;if(u.immobilized){u.exhausted=true;u.immobilized=false}else if(!u.stunned)u.exhausted=false;u.stunned=false;u.frozen=false;u.suffocated=false});p.support.forEach(u=>{u.exhausted=false;u.summoning=false;u.activatedThisTurn=false});
   resetTurnState(p);
   if(two&&g.round>1)draw(g,p,2);else{p.maxEnergy=Math.min(10,p.maxEnergy+1);draw(g,p)}
    p.energy=p.maxEnergy;resolveMaintenanceTriggers(g,0);g.phase="principal";queueCafeDoTempoPlacement(g);
   log(g,`${deckById(p.heroId).name} iniciou a etapa Principal com ${p.energy} de energia após ${two&&g.round>1?"comprar 2 cartas":"aumentar a energia máxima e comprar 1 carta"}.`,"phase");
  });
  setMaintenanceOpen(false);
 };
 useEffect(()=>{if(!visualFx&&visualFxQueue.length){setVisualFx(visualFxQueue[0]);setVisualFxQueue(queue=>queue.slice(1))}},[visualFx,visualFxQueue]);
 const resolveText=(g:Game,owner:0|1,c:CardDef,targetUid?:string,selectedImageName?:string,cafeEffect?:CafeChoice,allowVisualRepeat=false,targetUids?:string[])=>{const p=g.players[owner],o=g.players[owner===0?1:0];const text=("suffocated" in c&&c.suffocated?"":c.text).toLowerCase(),primaryText=text.split(/neste turno, seu próximo/i)[0];let resolved=false;const selectedTargetIds=targetUids?.length?targetUids:targetUid?[targetUid]:[],chosenEnemies=selectedTargetIds.map(id=>o.board.find(x=>x.uid===id)||o.support.find(x=>x.uid===id)||(o.terrain?.uid===id?o.terrain:undefined)).filter((unit):unit is Unit=>!!unit),chosenAllies=selectedTargetIds.map(id=>p.board.find(x=>x.uid===id)||p.support.find(x=>x.uid===id)||(p.terrain?.uid===id?p.terrain:undefined)).filter((unit):unit is Unit=>!!unit),chosenEnemy=chosenEnemies[0],chosenAlly=chosenAllies[0],chosenUnits=[...chosenEnemies,...chosenAllies];if(!text){log(g,`${c.name} está Sufocada e não pode ativar efeitos.`,"danger");return}
  const showTargetEffect=(label:string,target:CardDef|Unit)=>queueMicrotask(()=>showFx("ability",label,`${c.name} → ${target.name}`,baseCard(c),baseCard(target),allowVisualRepeat));
  /* Rules resolve atomically. Animation is presentation-only and never owns a game transition. */
  const deferUnitImpact=(target:Unit,targetOwner:0|1,label:string,apply:(live:Unit,player:Player,next:Game)=>void)=>{showTargetEffect(label,target);const player=g.players[targetOwner],live=[...player.board,...player.support,...(player.terrain?[player.terrain]:[])].find(unit=>unit.uid===target.uid);if(live)apply(live,player,g)};
    if(c.page===10){const targets=g.players.flatMap(entry=>entry.board);targets.forEach(unit=>{unit.damage=(unit.damage||0)+2});log(g,`Dragão de Limo explodiu em ácido e causou 2 de dano a ${targets.length} criatura(s) em campo.`,"damage");resolved=true}
    if(c.page===116){p.reserve=Math.min(3,p.reserve+1);log(g,"Conjurador concedeu 1 de energia à Reserva por Último Suspiro.","energy");resolved=true}
    if(c.page===118){const slot=firstFreeSlot(p.board),index=p.grave.findIndex(card=>card.type==="Criatura"&&card.cost<=2);if(slot===undefined)log(g,"Reanimador não encontrou espaço para retornar uma criatura.","manual");else if(index<0)log(g,"Reanimador não encontrou criatura de custo 2 ou menos no Cemitério.","manual");else{const card=p.grave.splice(index,1)[0];p.board.push(asUnit(card,slot));log(g,`Reanimador retornou ${card.name} do Cemitério ao campo.`,"effect")}resolved=true}
    if(c.page===119){const amount=g.players[0].turnDeaths+g.players[1].turnDeaths;if(amount>0){o.life-=amount;p.damageDealt+=amount;log(g,`Explosivo causou ${amount} de dano ao herói adversário por Último Suspiro.`,"damage")}else log(g,"Explosivo não causou dano: nenhuma criatura morreu neste turno.","effect");resolved=true}
    if(c.page===256){const milled=o.deck.splice(0,2);o.grave.push(...milled);log(g,`Cria de Ladino fez o oponente triturar ${milled.length} carta(s).`,"effect");resolved=true}
    if(c.page===95){const amount=p.grave.length;draw(g,p,amount);log(g,`Epifania comprou ${amount} carta(s) pelo seu Cemitério.`,"effect");resolved=true}
  const searchRequest=searchRequestFor(owner,c,p);if(searchRequest){if(owner===0)queueMicrotask(()=>setSearchChoice(current=>current||searchRequest));else{const candidates=p.deck.filter(card=>matchesSearch(card,searchRequest)).slice(0,searchRequest.limit);applySearchSelection(g,searchRequest,candidates.map(card=>card.id));queueMicrotask(()=>animateDeckShuffle(owner))}log(g,`${c.name} iniciou Procure: ${searchRequest.filterLabel}.`,"effect");resolved=true}else if(/embaralhe|embaralhar/i.test(text)){if(/cartas do seu cemitério no seu deck/i.test(text)){p.deck.push(...p.grave);p.grave=[]}p.deck=shuffle(p.deck);log(g,`${c.name} embaralhou o Deck Principal.`,"shuffle");queueMicrotask(()=>animateDeckShuffle(owner));resolved=true}
  const drawMatch=text.match(/compre\s+(\d+|uma?|duas?|dois|tr[eê]s)/);if(drawMatch&&c.page!==231){const amount=numericAmount(drawMatch[1]);draw(g,p,amount);log(g,`${c.name}: ${p.heroId===mine?"você":"IA"} comprou ${amount} carta(s).`,"effect");resolved=true}
  const healMatch=text.match(/(?:cure|restaure|recupere)\s+(\d+|uma?|duas?|dois|tr[eê]s)/);if(healMatch&&c.page!==231){const n=numericAmount(healMatch[1]),creatureTarget=chosenEnemy||chosenAlly;if(/criatura/i.test(primaryText)&&creatureTarget){creatureTarget.damage=Math.max(0,creatureTarget.damage-n);showTargetEffect("RESTAURAÇÃO",creatureTarget);log(g,`${c.name} restaurou ${n} de vida de ${creatureTarget.name}.`,"heal")}else if(targetUid==="enemy-hero"){o.life=Math.min(30,o.life+n);log(g,`${c.name} restaurou ${n} de vida do herói adversário.`,"heal")}else{p.life=Math.min(30,p.life+n);log(g,`${c.name} restaurou ${n} de vida.`,"heal")}resolved=true}
  /* Primeiro Ato resolves at the exact moment a creature (including an Image) enters.
     Dragon Images add their adjacent splash after the chosen primary target is hit. */
  const firstActDamage=/primeiro ato\s*:\s*pode causar\s+(\d+)\s+de dano/i.exec(primaryText);
  if(firstActDamage){const n=Number(firstActDamage[1]),targets=chosenUnits;if(targets.length){for(const target of targets){const ally=p.board.some(x=>x.uid===target.uid)||p.support.some(x=>x.uid===target.uid)||p.terrain?.uid===target.uid,targetOwner=(ally?owner:owner===0?1:0) as 0|1;const splash=/adjacentes ao alvo/i.test(primaryText)?Number(primaryText.match(/e\s+(\d+)\s+de dano as criaturas adjacentes/i)?.[1]||0):0;deferUnitImpact(target,targetOwner,"PRIMEIRO ATO",(live,targetPlayer,next)=>{const reduced=Math.max(0,n-(hasKeyword(targetPlayer,live,"Robusto")?1:0));live.damage+=reduced;if(reduced>0)markCreatureDamage(c,targetOwner);if(c.tags.some(tag=>cleanName(tag)==="roubo de vida"))next.players[owner].life=Math.min(30,next.players[owner].life+reduced);if(splash)targetPlayer.board.filter(unit=>Math.abs(unit.slot-live.slot)===1).forEach(unit=>{deferUnitImpact(unit,targetOwner,"IMPACTO ADJACENTE",adjacent=>{adjacent.damage+=Math.max(0,splash-(hasKeyword(targetPlayer,adjacent,"Robusto")?1:0))})});log(next,`${c.name} ativou Primeiro Ato: ${reduced} de dano em ${live.name}${splash?` e ${splash} nas criaturas adjacentes`:""}.`,"damage")})}}else log(g,`${c.name} entrou em campo; Primeiro Ato não teve alvo para causar dano.`,"effect");resolved=true}
  const isEarthquake=cleanName(c.name)==="terremoto";if(isEarthquake){const amount=earthquakeDamage(o.board.length);[...p.board,...o.board].forEach(unit=>{unit.damage+=amount;showTargetEffect("TERREMOTO",unit)});log(g,`${c.name} causou ${amount} de dano a cada criatura, igual ao número de criaturas inimigas em campo.`,"damage");resolved=true}
  const damageMatch=primaryText.match(/cause\s+(\d+)\s+de dano/);if(damageMatch&&!firstActDamage&&!isEarthquake&&!/(?:todas?|cada)\s+(?:as?\s+)?criaturas/i.test(primaryText)){const n=Number(damageMatch[1]);if(chosenUnits.length){for(const target of chosenUnits){const ally=p.board.some(x=>x.uid===target.uid)||p.support.some(x=>x.uid===target.uid)||p.terrain?.uid===target.uid,targetOwner=(ally?owner:owner===0?1:0) as 0|1;deferUnitImpact(target,targetOwner,"EFEITO DE DANO",(live,targetPlayer,next)=>{const reduced=Math.max(0,n-(hasKeyword(targetPlayer,live,"Robusto")?1:0));live.damage+=reduced;if(c.tags.some(tag=>cleanName(tag)==="toque da morte")&&reduced>0&&!hasKeyword(targetPlayer,live,"Indestrutível"))live.damage=999;if(c.tags.some(tag=>cleanName(tag)==="roubo de vida"))next.players[owner].life=Math.min(30,next.players[owner].life+reduced);log(next,`${c.name} causou ${reduced} de dano em ${live.name}.`,"damage")})}}else{for(const id of selectedTargetIds){if(id==="enemy-hero"){o.life-=n;p.damageDealt+=n;if(n>0)markCreatureDamage(c,owner===0?1:0);if(c.tags.some(tag=>cleanName(tag)==="roubo de vida"))p.life=Math.min(30,p.life+n);log(g,`${c.name} causou ${n} de dano ao herói adversário.`,"damage")}else if(id==="ally-hero"){p.life-=n;if(n>0)markCreatureDamage(c,owner);log(g,`${c.name} causou ${n} de dano ao próprio herói.`,"damage")}}if(!selectedTargetIds.length)log(g,`${c.name} exige que o jogador escolha um alvo válido.`,"manual")}resolved=true}
  if(/(?:destrua|elimine|derrote) (?:uma|a|duas|até duas)?\s*criatura/.test(text)&&chosenUnits.length){for(const target of chosenUnits){const ally=p.board.some(x=>x.uid===target.uid)||p.support.some(x=>x.uid===target.uid)||p.terrain?.uid===target.uid,targetOwner=(ally?owner:owner===0?1:0) as 0|1;deferUnitImpact(target,targetOwner,"DESTRUIÇÃO",(live,_player,next)=>{live.damage=999;log(next,`${c.name} destruiu ${live.name}.`,"danger")})}resolved=true}
  if(/\bbana\b|\bbanir\b/.test(text)){const target=chosenAlly||chosenEnemy;if(target){const targetPlayer=chosenAlly?p:o,targetOwner=(chosenAlly?owner:owner===0?1:0) as 0|1;deferUnitImpact(target,targetOwner,"BANIMENTO",(live,player,next)=>{const isCreature=player.board.some(x=>x.uid===live.uid);if(isCreature)discardLinkedArtifacts(next,player,live.uid);player.board=player.board.filter(x=>x.uid!==live.uid);player.support=player.support.filter(x=>x.uid!==live.uid);if(player.terrain?.uid===live.uid)player.terrain=null;sendToObscuro(next,player,live)});resolved=true}}
  if(/retorne .*criatura.*mão|devolva .*criatura.*mão/.test(text)){const target=chosenEnemy||chosenAlly||(!targetUid?o.board[0]:undefined);if(target){const targetPlayer=chosenAlly?p:o;discardLinkedArtifacts(g,targetPlayer,target.uid);targetPlayer.board=targetPlayer.board.filter(x=>x.uid!==target.uid);if(target.imageCard||target.generatedImage)returnImage(g,targetPlayer,target,"foi devolvida à mão");else targetPlayer.hand.push(baseCard(target));log(g,`${c.name} retornou ${target.name} à mão de ${targetPlayer===p?"seu controlador aliado":"seu controlador adversário"}.`,"effect");resolved=true}}
  const buff=text.match(/(?:recebe|ganha|conceda|forneça|forneca|dê)[^\d+]*\+?(\d+)?\s*\/\s*\+?(\d+)?/);if(buff&&chosenAlly){const atk=Number(buff[1]||0),hp=Number(buff[2]||0),fleeting=/neste turno|até o fim deste turno|até o final deste turno|até o início do seu próximo turno|até o inicio do seu próximo turno/i.test(text);if(fleeting){chosenAlly.temporaryAtk=(chosenAlly.temporaryAtk||0)+atk;chosenAlly.temporaryHp=(chosenAlly.temporaryHp||0)+hp}else{chosenAlly.bonusAtk+=atk;chosenAlly.bonusHp+=hp}showTargetEffect(buffEffectLabel(c,chosenAlly,atk,hp),chosenAlly);log(g,`${c.name} fortaleceu ${chosenAlly.name}${fleeting?" até o fim do turno":""}.`,"effect");resolved=true}
  if(chosenAlly&&/(conceda|forneça|forneca|dê|recebe|ganha)/i.test(primaryText)){for(const keyword of ["Voar","Barreira Mágica","Atropelar","Investida","Indomável","Furtivo","Veloz","Robusto","Roubo de Vida","Toque da Morte","Indestrutível"]){if(new RegExp(keyword,"i").test(primaryText)&&!hasKeyword(p,chosenAlly,keyword)){const fleeting=/neste turno|até o fim deste turno|até o final deste turno/i.test(primaryText);if(fleeting)chosenAlly.temporaryTags=[...(chosenAlly.temporaryTags||[]),keyword];else chosenAlly.tags.push(keyword);log(g,`${chosenAlly.name} recebeu ${keyword}${fleeting?" neste turno":""}.`,"effect");resolved=true}}}
  const energyMatch=text.match(/(?:receba|adicione)\s+(\d+)\s+de energia/);if(energyMatch){p.energy+=Number(energyMatch[1]);log(g,`${c.name} gerou ${energyMatch[1]} energia.`,"energy");resolved=true}
  const reserveFill=/preencha(?: sua)?(?: energia)? reserva/i.test(primaryText);if(reserveFill){p.reserve=3;log(g,`${c.name} preencheu a reserva de energia.`,"energy");resolved=true}
  const maxEnergyMatch=primaryText.match(/(?:aumente|adicione)\s+(\d+)\s+de energia máxima/i);if(maxEnergyMatch){const n=Number(maxEnergyMatch[1]);p.maxEnergy=Math.min(10,p.maxEnergy+n);if(p.energy>p.maxEnergy)p.energy=p.maxEnergy;log(g,`${c.name} aumentou o limite de energia máxima em ${n}.`,"energy");resolved=true}
  const lifeForSummon=/custa vida ao invés de energia|custar vida ao invés de energia|próxima criatura que for invocada nesse turno/i.test(primaryText);if(lifeForSummon){p.nextSummonPaysLife=true;log(g,`${c.name} fará a próxima criatura invocada pagar vida em vez de energia.`,"effect");resolved=true}
  const discardMatch=/descarte sua mão e compre o mesmo número de cartas/i.test(primaryText);if(discardMatch){const hand=[...p.hand];p.hand=[];p.grave.push(...hand);draw(g,p,hand.length);log(g,`${c.name} descartou a mão e comprou ${hand.length} carta(s) novas.`,"effect");resolved=true}
  const consumeEnergyMatch=/consuma toda a sua energia disponível|energia consumida/i.test(primaryText);if(consumeEnergyMatch){const spent=p.energy+p.reserve;p.energy=0;p.reserve=0;const target=chosenEnemy||(!targetUid?o.board[0]:undefined);if(target){target.damage+=spent;log(g,`${c.name} consumiu ${spent} de energia e causou ${spent} de dano em ${target.name}.`,"damage")}else{o.life-=spent;p.damageDealt+=spent;log(g,`${c.name} consumiu ${spent} de energia e causou ${spent} de dano ao herói adversário.`,"damage")}resolved=true}
  const nextDiscount=primaryText.match(/próxim[ao]\s+carta[^.]*custa\s+(\d+)\s+a menos/i),nextNonCreature=primaryText.match(/próxim[ao]\s+carta não-criatura[^.]*custa\s+(\d+)\s+a menos/i),nextSpell=primaryText.match(/próxim[ao]\s+feitiço[^.]*custa\s+(\d+)\s+a menos/i);if(nextNonCreature){p.nextNonCreatureDiscount=Math.max(p.nextNonCreatureDiscount,Number(nextNonCreature[1]));log(g,`${c.name}: a próxima carta não-criatura custa ${nextNonCreature[1]} a menos neste turno.`,"energy");resolved=true}else if(nextSpell){p.nextSpellDiscount=Math.max(p.nextSpellDiscount,Number(nextSpell[1]));log(g,`${c.name}: o próximo Feitiço custa ${nextSpell[1]} a menos neste turno.`,"energy");resolved=true}else if(nextDiscount){p.nextCardDiscount=Math.max(p.nextCardDiscount,Number(nextDiscount[1]));log(g,`${c.name}: a próxima carta custa ${nextDiscount[1]} a menos neste turno.`,"energy");resolved=true}
  if(/triture\s+(\d+|uma?|duas?|dois|tr[eê]s)/.test(primaryText)){const n=numericAmount(primaryText.match(/triture\s+(\d+|uma?|duas?|dois|tr[eê]s)/)?.[1]);for(let i=0;i<n;i++){const milled=o.deck.shift();if(milled)o.grave.push(milled)}log(g,`${c.name} triturou ${n} carta(s) para o Cemitério.`,"effect");resolved=true}
  const investigateMatch=primaryText.match(/investigue\s+(\d+)/);if(investigateMatch){investigate(g,p,o,Number(investigateMatch[1]));resolved=true}
  /* Global effects never request a target. Apply exactly to their declared scope. */
  const globalCreatures=/(?:todas?\s+(?:as?\s+)?criaturas|cada\s+criatura)/i.test(primaryText);
  if(globalCreatures){
   const scope=/inimig/i.test(primaryText)?o.board:/aliad|suas?/i.test(primaryText)?p.board:[...p.board,...o.board];
   const pair=primaryText.match(/receb(?:e|em)\s*([+-]\d+)\s*\/?\s*([+-]\d+)/i);
   if(pair){scope.forEach(unit=>{unit.bonusAtk+=Number(pair[1]);unit.bonusHp+=Number(pair[2]);showTargetEffect("EFEITO GLOBAL",unit)});log(g,`${c.name} afetou ${scope.length} criatura(s) sem seleção de alvo.`,"effect");resolved=true}
  }
  const statusTargets=cleanName(c.name)==="clone de agua"?(chosenEnemy?[chosenEnemy]:[]):chosenEnemy?[chosenEnemy]:o.board;const statusOwner=(owner===0?1:0) as 0|1;if(/aplique\s+congelad|aplica\s+congelad/.test(primaryText)){statusTargets.forEach(unit=>deferUnitImpact(unit,statusOwner,"CONGELADO",(live,_player,next)=>{if(live.frozen)live.damage+=2;live.frozen=true;log(next,`${c.name} aplicou Congelado a ${live.name}.`,"effect")}));resolved=true}
  if(/aplique\s+atordoad|aplica\s+atordoad/.test(primaryText)){statusTargets.forEach(unit=>deferUnitImpact(unit,statusOwner,"ATORDOADO",(live,_player,next)=>{live.stunned=true;live.exhausted=true;log(next,`${c.name} aplicou Atordoado a ${live.name}.`,"effect")}));resolved=true}
   if(/aplique\s+sufoc|aplica\s+sufoc/.test(primaryText)){statusTargets.forEach(unit=>deferUnitImpact(unit,statusOwner,"SUFOCADO",(live,_player,next)=>{live.suffocated=true;log(next,`${c.name} aplicou Sufocado a ${live.name}, suprimindo temporariamente seus efeitos positivos.`,"effect")}));resolved=true}
  if(/aplique\s+imobiliz|aplica\s+imobiliz/.test(primaryText)){statusTargets.forEach(unit=>deferUnitImpact(unit,statusOwner,"IMOBILIZADO",(live,_player,next)=>{live.immobilized=true;log(next,`${c.name} aplicou Imobilizado a ${live.name}.`,"effect")}));resolved=true}
  /* An elemental promise belongs to the previous spell. A matching next
     elemental spell consumes it, announces each impacted card and only then
     applies the extra status. The current spell subsequently prepares its own
     promise, preserving the intended one-spell-to-the-next chain. */
  const element=cardElement(c),activeChain=element&&p.elementChain?.element===element?p.elementChain:undefined;
  if(activeChain){
   const affected=chosenEnemy?[chosenEnemy]:o.board;
   affected.forEach(unit=>deferUnitImpact(unit,owner===0?1:0,`CADEIA · ${activeChain.effect.toUpperCase()}`,(live,_player,next)=>{
    if(activeChain.effect==="Congelado")live.frozen=true;
    else if(activeChain.effect==="Atordoado"){live.stunned=true;live.exhausted=true}
    else if(activeChain.effect==="Sufocado")live.suffocated=true
    else live.immobilized=true;
    log(next,`Cadeia Elemental: ${c.name} aplicou ${activeChain.effect} adicional a ${live.name}.`,"elemental")
   }));
   p.elementChain=undefined;
   log(g,`Cadeia Elemental consumida: o efeito adicional de ${activeChain.effect} foi ativado por ${c.name}.`,"elemental");
   resolved=true
  }
  if(element){
   p.elementChain=elementChainFrom(c);
   if(p.elementChain)log(g,`${c.name} preparou ${p.elementChain.effect} para o próximo feitiço de ${p.elementChain.element}.`,"elemental")
  }
  const imageName=selectedImageName||directImages[c.page];if(imageName){if(c.page===13){const old=p.board.find(x=>cleanName(x.name)===cleanName("Dragão Filhote"));if(old){p.board=p.board.filter(x=>x.uid!==old.uid);returnImage(g,p,old,"foi substituído")}}if(c.page===14){const old=p.board.find(x=>cleanName(x.name)===cleanName("Dragão Jovem"));if(old){p.board=p.board.filter(x=>x.uid!==old.uid);returnImage(g,p,old,"foi substituído")}}const before=new Set([...p.board,...p.support].map(x=>x.uid));if(summonImage(g,owner,imageName)){const summoned=[...p.board,...p.support].find(x=>!before.has(x.uid));if(summoned){/* Queue the generated card itself after its source spell; this makes Extra Deck creation visible. */queueMicrotask(()=>showFx("summon","IMAGEM INVOCADA",summoned.name,baseCard(summoned)));if(hasKeyword(p,summoned,"Primeiro Ato")){log(g,`A Imagem ${summoned.name} entrou em campo e ativou Primeiro Ato.`,"image");resolveText(g,owner,summoned,targetUid,undefined,undefined,allowVisualRepeat)}}resolved=true}}
  if(c.page===231&&cafeEffect){if(cafeEffect==="cats"){let created=0;for(let i=0;i<3;i++){const destination=(p.board.length<5?owner:owner===0?1:0) as 0|1;if(summonCreatedImage(g,destination,"Gato Multidimensional"))created++}log(g,`Café Especial criou ${created} Imagem(ns) de Gato Multidimensional, preenchendo primeiro o campo do jogador atual.`,"image")}else if(cafeEffect==="heal"){p.life=Math.min(30,p.life+10);log(g,"Café Especial curou 10 de vida.","heal")}else if(cafeEffect==="draw"){draw(g,p,3);log(g,"Café Especial comprou 3 cartas.","effect")}else{p.level=Math.min(3,p.level+1);log(g,`Café Especial elevou o herói ao nível ${p.level}.`,"effect")}resolved=true}
  if(c.page===46){p.pendingTranqueira=true;log(g,"TRANQUEIRA-MÁTICA aguardará o fim do turno para gerar a Bugiganga correspondente.","image");resolved=true}
  if(!resolved)log(g,`${c.name}: efeito registrado para resolução manual durante o teste.`,"manual");
 };
 /* Target selection is based only on the effect that resolves now. Deferred
    clauses ("Neste turno, seu próximo...") describe a future spell and must
    never make the source card request a target — notably Levantar Maré. */
 const immediateEffectText=immediateCardEffectText;
 const playEffectText=cardPlayEffectText;
 const playTargetPolicy=(c:CardDef)=>cardPlayTargetPolicy({...c,text:playEffectText(c)});
 const targetScopeAt=(c:CardDef,step=0)=>playTargetPolicy(c).steps?.[step]?.scope??playTargetPolicy(c).scope;
 const targetRule=(c:CardDef,step=0):"ally"|"enemy"|"any"|"none"=>{const scope=targetScopeAt(c,step);return [TargetScope.ALLY_CREATURE,TargetScope.ALLY_PERMANENT].includes(scope)?"ally":[TargetScope.ENEMY_CREATURE,TargetScope.ENEMY_PERMANENT].includes(scope)?"enemy":scope===TargetScope.NONE?"none":"any"};
 const targetSubtype=(c:CardDef)=>{const explicit=c.abilities?.flatMap((ability:any)=>ability.effects||[]).find((effect:any)=>effect.requiredSubtype)?.requiredSubtype as CardFaction|undefined;if(explicit)return explicit;const value=cleanName(playEffectText(c));return (["Dragão","Goblin","Gato","Vampiro","Recruta","Fênix"] as CardFaction[]).find(subtype=>new RegExp(`(?:destrua|bana|escolha|selecione|alvo)[^.]{0,35}\\b${cleanName(subtype)}s?\\b`,"i").test(value))};
 const runRulesCommand=async(command:Record<string,unknown>,owner:0|1=0):Promise<boolean>=>{try{if((window as Window&{__hemsfellPresentationBusy?:boolean}).__hemsfellPresentationBusy)return false;if(mode==="online"){const logicalCommand={...command};delete logicalCommand.instanceId;const signature=`${owner}:${JSON.stringify(logicalCommand)}`,existing=onlineCommandFlightsRef.current.get(signature);if(existing)return existing;if(onlineCommandFlightsRef.current.size){setRoomError("Aguarde a ação anterior ser confirmada pela sala.");return false;}setOnlineCommandPending(true);const commandId=crypto.randomUUID();const task=roomAction("command",{command,commandId,baseRevision:roomRevisionRef.current}).then(result=>{return!!result}).finally(()=>{if(onlineCommandFlightsRef.current.get(signature)===task)onlineCommandFlightsRef.current.delete(signature);if(!onlineCommandFlightsRef.current.size)setOnlineCommandPending(false)});onlineCommandFlightsRef.current.set(signature,task);return task}const current=currentGameRef.current;if(!current)return false;const next=executeCommand(current,{...command,owner},{priority:true,presentation:true}).state as Game;if(next.pendingResponse&&!next.pendingResponse.deadline)next.pendingResponse={...next.pendingResponse,deadline:Date.now()+(roomInfo?.settings?.responseSeconds??30)*1000};syncDynamicFieldCounts(next);currentGameRef.current=next;setGame(next);setResponseWindow(next.pendingResponse??null);return true}catch(error){setRoomError(error instanceof Error?`A regra recusou a ação: ${error.message}`:"A regra recusou a ação.");return false}};
 const passPriorityWindow=async(owner:0|1,auto=false)=>{const current=currentGameRef.current;if(mode==="online"){if(current?.pendingResponse?.responder!==owner)return true;return runRulesCommand({type:"passPriority",auto},owner)}if(current?.pendingResponse?.responder===owner)return runRulesCommand({type:"passPriority",auto},owner);setResponseWindow(null);return true};
 const canChooseAllTargets=(c:CardDef,steps:Array<{scope:string;role?:string;optional?:boolean;requireExhausted?:boolean;requiresDamagedOwnerThisTurn?:boolean;requiresEffectAppliedThisTurn?:boolean;requiresMarker?:boolean;allowedIds?:string[]}>)=>{if(!game)return false;const subtype=targetSubtype(c);const eligible=(unit:Unit,step:any,owner:number,kind:"creature"|"permanent")=>isValidTarget(step as any,0,owner,kind)&&(!step.requireExhausted||unit.exhausted)&&(!step.requiresDamagedOwnerThisTurn||(unit.damagedOwnersThisTurn||[]).includes(0))&&(!step.requiresEffectAppliedThisTurn||(unit as any).effectAppliedRound===game.round)&&(!step.requiresMarker||Number(typeof unit.markers==="number"?unit.markers:Object.values(unit.markers||{}).reduce((sum,value)=>sum+Number(value||0),0))>0)&&(!step.allowedIds?.length||step.allowedIds.includes(unit.uid))&&(!(step.role==="effect"&&subtype)||hasSubtype(unit,subtype));const candidates=steps.map(step=>{const ids:string[]=[];game.players.forEach((player,targetOwner)=>{player.board.forEach(unit=>{if(eligible(unit,step,targetOwner,"creature"))ids.push(unit.uid)});player.support.forEach(unit=>{if(eligible(unit,step,targetOwner,"permanent"))ids.push(unit.uid)});if(player.terrain&&eligible(player.terrain,step,targetOwner,"permanent"))ids.push(player.terrain.uid);if(isValidTarget(step as any,0,targetOwner,"hero")&&!step.requiresEffectAppliedThisTurn&&!step.requiresMarker&&!step.allowedIds?.length)ids.push(targetOwner===0?"ally-hero":"enemy-hero")});return ids});const choose=(index:number,used:Set<string>):boolean=>index>=candidates.length||(steps[index]?.optional&&choose(index+1,used))||candidates[index].some(id=>{if(used.has(id))return false;const next=new Set(used);next.add(id);return choose(index+1,next)});return choose(0,new Set())};
 const requestPlay=(idx:number,zone:"creature"|"support"|"terrain",fieldSlot?:number)=>{setDragging(null);if(!game||game.active!==0||game.phase!=="principal"||onlineCommandPending)return;const p=game.players[0],c=p.hand[idx];if(!c)return;const catSupport=zone==="support"&&p.heroId==="rasmus"&&p.level>=3&&hasFaction(c,"Gato");if([55,56].includes(c.page)&&!game.players.some(player=>player.board.length)){update(g=>log(g,`${c.name} só pode ser jogada se houver ao menos uma criatura em campo.`,"danger"));return}if(!cardPlayRequirementMet(c,p,game,0)){update(g=>log(g,c.page===17?`${c.name} exige um Dragão desvirado seu e uma criatura inimiga em campo.`:`${c.name} só pode ser jogada se houver um Goblin no seu Cemitério.`,"danger"));return}const correct=c.type==="Criatura"?"creature":c.type==="Terreno"?"terrain":"support";if(zone!==correct&&!catSupport){update(g=>log(g,`${c.name} deve ser jogada na zona ${correct==="creature"?"de criaturas":correct==="terrain"?"de Terreno Cruel":"inferior"}.`,"danger"));return}if(zone==="creature"&&fieldSlot===undefined){update(g=>log(g,"Escolha um espaço de criatura.","danger"));return}if(zone==="creature"&&p.board.some(unit=>unit.slot===fieldSlot)&&p.board.length<5){update(g=>log(g,"Esse espaço já está ocupado. A substituição só é permitida quando as cinco posições de criatura estiverem preenchidas.","danger"));return}if(zone==="support"&&(fieldSlot===undefined||p.support.some(unit=>unit.slot===fieldSlot))){update(g=>log(g,"Escolha um espaço auxiliar vazio.","danger"));return}const host=c.type==="Artefato"?p.board.find(unit=>unit.slot===fieldSlot):undefined;if(c.type==="Artefato"&&!host&&c.page!==304){update(g=>log(g,`${c.name} só pode ocupar o espaço auxiliar diretamente abaixo de uma criatura aliada.`,"danger"));return}if(c.page===231){setCafeChoice(idx);return}if(cleanName(c.name)==="orbe cromatico"){setElementChoice({cardIndex:idx,name:c.name});return}const enhancedWater=[61,62].includes(c.page)&&(p.nextElementEffects||[]).some(effect=>cleanName(effect.element)===cleanName("Água"));if(enhancedWater&&game.players.some(player=>player.board.length)){setTargeting({kind:"elemental-optional",source:c.name,cardIndex:idx,fieldSlot,required:1,minimum:0,selected:[]});return}const options=imageChoices[c.page];if(options){setImageChoice({cardIndex:idx,cardName:c.name,options,fieldSlot});return}const policy=playTargetPolicy(c),duplicateFirstAct=c.type==="Criatura"&&p.heroId==="quarion"&&p.level>=3&&/primeiro ato/i.test(c.text)?2:1,required=policy.selections*duplicateFirstAct,minimum=Math.max(0,(policy.minimumSelections??policy.selections)*duplicateFirstAct);if(c.type==="Artefato"){playCard(idx,0,host?.uid,undefined,undefined,false,fieldSlot);return}const requiredSteps=Array.from({length:duplicateFirstAct},()=>policy.steps||[]).flat();if(policy.selections>0&&!canChooseAllTargets(c,requiredSteps)){if(c.type==="Criatura"){playCard(idx,0,undefined,undefined,undefined,false,fieldSlot);return}update(g=>log(g,`${c.name} não pode ser jogada porque não existem alvos válidos suficientes.`,"danger"));return}if(policy.selections>0){setTargeting({kind:"spell",source:policy.sacrifice?`${c.name} · cumpra o custo e escolha os alvos`:c.name,cardIndex:idx,fieldSlot,required,minimum,selected:[]});return}playCard(idx,0,undefined,undefined,undefined,false,fieldSlot,undefined,undefined,undefined,catSupport?"support":undefined)};
 const playCard=(idx:number,owner:0|1=0,targetUid?:string,selectedImageName?:string,cafeEffect?:CafeChoice,asResponse=false,fieldSlot?:number,chosenElement?:ElementName,targetUids?:string[],elementalTargetId?:string,placementZone?:"support")=>{
  if(presentationBusy||visualFx||visualFxQueue.length||shufflingDeck!==null)return;
  const snapshot=game?.players[owner].hand[idx],snapshotPlayer=game?.players[owner],snapshotPolicy=snapshot?playTargetPolicy(snapshot):undefined,selectedIds=targetUids?.length?targetUids:targetUid?[targetUid]:[],effectIds=selectedIds.filter((_,index)=>snapshotPolicy?.steps?.[index]?.role!=="sacrifice"),primaryTargetUid=effectIds[0]??targetUid,antiMagicTarget=snapshot?.type==="Feitiço"&&game?.players.some(player=>player.board.some(unit=>unit.uid===primaryTargetUid&&unit.page===166));if(!game||!snapshot||!snapshotPlayer||mode==="online"&&!asResponse&&game.pendingResponse?.actor===owner)return;const cost=effectiveCost(snapshot,snapshotPlayer)+(antiMagicTarget?1:0),payLifeInstead=creaturePaysLife(snapshot,snapshotPlayer,asResponse),offTurnResponse=asResponse&&game.active!==owner,resource=playableResource(snapshot,snapshotPlayer,offTurnResponse);if(cost>resource||asResponse&&!isFast(snapshot))return;
  const fxKind:VisualFx["kind"]=snapshot.type==="Criatura"?"summon":snapshot.type==="Artefato"||snapshot.type==="Encanto"?"artifact":snapshot.type==="Terreno"?"terrain":"spell",fxLabel=snapshot.type==="Criatura"?"INVOCAÇÃO":snapshot.type==="Feitiço"?"FEITIÇO CONJURADO":snapshot.type==="Terreno"?"NOVA REALIDADE":"CONSTANTE EM CAMPO";
  if(canExecuteCard(snapshot)){const policy=playTargetPolicy(snapshot),allIds=targetUids?.length?targetUids:targetUid?[targetUid]:[],sacrificeIds=allIds.filter((_,index)=>policy.steps?.[index]?.role==="sacrifice"),effectTargetIds=allIds.filter((_,index)=>{const role=policy.steps?.[index]?.role;return role!=="sacrifice"&&role!=="attachment"}),slot=fieldSlot??(snapshot.type==="Criatura"?firstFreeSlot(snapshotPlayer.board):snapshot.type==="Terreno"?0:firstFreeSlot(snapshotPlayer.support));void runRulesCommand({type:"playCard",cardId:snapshot.id,instanceId:uid(),slot,attachedTo:snapshot.type==="Artefato"?targetUid:undefined,targetIds:effectTargetIds,sacrificeIds,hasPriority:asResponse,chosenElement,selectedImageName,cafeEffect,elementalTargetId,placementZone},owner);return}
  if(mode==="online"){setRoomError(`${snapshot.name} ainda não possui uma execução autoritativa no modo Online.`);return}
  showFx(fxKind,fxLabel,snapshot.name,snapshot);
  update(g=>{
   const p = g.players[owner]; let c = p.hand[idx];
   if (!c) return;
   if(chosenElement)c={...c,text:`${c.text} Elemento: ${chosenElement}`};
    const policy=playTargetPolicy(c),allTargetIds=targetUids?.length?targetUids:targetUid?[targetUid]:[],sacrificeIds=allTargetIds.filter((_,index)=>policy.steps?.[index]?.role==="sacrifice"),effectTargetIds=allTargetIds.filter((_,index)=>policy.steps?.[index]?.role!=="sacrifice"),resolvedTargetUid=effectTargetIds[0]??targetUid;
    const antiMagicTarget=c.type==="Feitiço"&&g.players.some(player=>player.board.some(unit=>unit.uid===resolvedTargetUid&&unit.page===166));
    const paidCost = effectiveCost(c, p)+(antiMagicTarget?1:0);
   if (asResponse) {
    if (!isFast(c) || paidCost > playableEnergy(c,p,g.active!==owner)) return;
   } else if (g.active !== owner || g.phase !== "principal" || paidCost > playableResource(c,p)) return;
   const creatureSlot = fieldSlot ?? firstFreeSlot(p.board);
   const host = c.type === "Artefato" ? p.board.find(x => x.uid === resolvedTargetUid) : undefined;
   const supportSlot = fieldSlot ?? (c.type === "Artefato" ? host?.slot : firstFreeSlot(p.support));
   if (c.type === "Criatura" && creatureSlot === undefined) {
    log(g, "Escolha um espaço de criatura válido.", "danger");
    return;
   }
   if ((c.type === "Artefato" || c.type === "Encanto") && (supportSlot === undefined || p.support.some(x => x.slot === supportSlot))) {
    log(g, "O espaço auxiliar escolhido não está disponível.", "danger");
    return;
   }
   if (c.type === "Artefato" && (!host || host.slot !== supportSlot)) {
    log(g, `${c.name} precisa ser colocado diretamente abaixo da criatura à qual será vinculado.`, "danger");
    return;
   }
   const furaTag=c.tags.some(tag=>cleanName(tag)==="fura fila"),furaActive=furaTag&&p.turnCardsPlayed>0,lifeLoss=Number(playEffectText(c).match(/\bperca\s+(\d+)\s+(?:de\s+)?vida/i)?.[1]||0);if(policy.sacrifice){const sacrifices=sacrificeIds.map(id=>p.board.find(unit=>unit.uid===id)).filter((unit):unit is Unit=>!!unit);if(sacrifices.length<(policy.sacrificeCount||1)){log(g,`${c.name} exige o sacrifício de ${policy.sacrificeCount||1} criatura(s) aliada(s).`,"danger");return}sacrifices.forEach(sacrifice=>{sacrifice.damage=999;log(g,`${sacrifice.name} foi sacrificada para jogar ${c.name}.`,"danger")})}if(lifeLoss){p.life=Math.max(p.heroId==="saymon"&&p.level>=3?1:0,p.life-lifeLoss);if(p.heroId==="saymon")p.heroXP++;log(g,`${c.name} fez ${deckById(p.heroId).name} perder ${lifeLoss} de vida.`,"damage")}if(payLifeInstead){p.life-=paidCost;if(p.heroId==="saymon")p.life=Math.max(1,p.life);p.nextSummonPaysLife=false}else spendCardEnergy(p,c,paidCost,asResponse&&g.active!==owner);p.hand.splice(idx,1);p.cardsPlayed++;if(g.active===owner)p.turnCardsPlayed++;if(g.active===owner&&p.heroId==="goblin")p.goblinTurnCardsPlayed=(p.goblinTurnCardsPlayed||0)+1;if(c.type==="Feitiço"&&g.active===owner)p.turnSpellsPlayed++;if(p.nextCardDiscount>0)p.nextCardDiscount=0;if(c.type!=="Criatura"&&p.nextNonCreatureDiscount>0)p.nextNonCreatureDiscount=0;if(c.type==="Feitiço"&&p.nextSpellDiscount>0)p.nextSpellDiscount=0;
   if(payLifeInstead)p.nextCreaturePaysLife=false;
   const archetype=deckById(p.heroId).id;if(archetype==="goblin"||archetype==="gimble"&&hasFaction(c,"Dragão")||archetype==="rasmus"&&hasFaction(c,"Gato")||archetype==="zayan"&&c.type==="Criatura"&&!c.text.trim())p.heroXP++;
   log(g,`${deckById(p.heroId).name} ${asResponse?"respondeu com":"jogou"} ${c.name}${fieldSlot!==undefined?` no espaço ${fieldSlot+1}`:""}.`,asResponse?"response":"play");if(furaTag)log(g,`Fura-Fila de ${c.name} ${furaActive?"foi ativado":"não foi ativado porque era a primeira carta do turno"}.`,furaActive?"effect":"manual");
   if(c.type==="Criatura"){
    const replaced=p.board.find(existing=>existing.slot===creatureSlot);if(replaced){p.board=p.board.filter(existing=>existing.uid!==replaced.uid);sendToObscuro(g,p,replaced);const linkedCount=discardLinkedArtifacts(g,p,replaced.uid);log(g,`${replaced.name} foi banida para abrir o espaço ${creatureSlot!+1}; ${linkedCount} Artefato(s) vinculado(s) foram descartados.`,"obscuro")}
    const unit=asUnit(c,creatureSlot!);p.board.push(unit);resolveCreatureEntryTriggers(g,owner,unit);if(furaActive){if(/recebe\s+Investida/i.test(c.text))unit.summoning=false;if(/recebe[^.]*Último Suspiro/i.test(c.text)&&!unit.tags.includes("Último Suspiro"))unit.tags.push("Último Suspiro");const pair=c.text.match(/Fura-fila:[^.]*\+([0-9]+)\s*\/\s*\+([0-9]+)/i);if(pair){const multiplier=/para cada carta/i.test(c.text)?p.turnCardsPlayed:1;unit.bonusAtk+=Number(pair[1])*multiplier;unit.bonusHp+=Number(pair[2])*multiplier}const attack=c.text.match(/Fura-fila:[^.]*\+([0-9]+)\s+de Ofensividade/i);if(attack)unit.bonusAtk+=Number(attack[1])}
    if(hasKeyword(p,unit,"Primeiro Ato")){if(targetRule(c)!=="none"&&!effectTargetIds.length)log(g,`${c.name} entrou em campo sem alvo; seu Primeiro Ato de alvo não foi ativado.`,"manual");else{const activations=archetype==="quarion"&&p.level>=3?2:1,perActivation=Math.max(1,playTargetPolicy(c).selections);for(let activation=0;activation<activations;activation++){const activationTargets=effectTargetIds.slice(activation*perActivation,(activation+1)*perActivation);resolveText(g,owner,unit,activationTargets[0]??resolvedTargetUid,selectedImageName,cafeEffect,activation>0,activationTargets);if(activation===0&&activations===2)log(g,`Quarion duplicou o Primeiro Ato de ${c.name}.`,"effect")}}}
   }else if(c.type==="Artefato"||c.type==="Encanto"){
    const unit={...asUnit(c,supportSlot!),attachedTo:c.type==="Artefato"?resolvedTargetUid:undefined};p.support.push(unit);if(unit.attachedTo)log(g,`${c.name} foi vinculado a ${host!.name}; os atributos e palavras-chave concedidos já estão ativos.`,"effect");resolveText(g,owner,unit,targetUid,selectedImageName,cafeEffect)
   }else if(c.type==="Terreno"){
    if(p.terrain){const previous=p.terrain;sendToGrave(g,p,previous);log(g,`${previous.name} foi substituído pelo novo Terreno Cruel.`,"effect")}p.terrain=asUnit(c,0);resolveText(g,owner,p.terrain,targetUid,selectedImageName,cafeEffect)
    }else{
     p.spellsPlayed++;resolveSpellCastTriggers(g,owner,c,(label,detail,source,target)=>queueMicrotask(()=>showFx("ability",label,detail,baseCard(source),target)));if(archetype==="uruk")p.heroXP++;if(archetype==="rasmus"&&/café|cafe/i.test(c.name)){p.coffeeSpells++;if(p.coffeeSpells===10)summonImage(g,owner,"Café Especial","hand")}sendToGrave(g,p,c);resolveText(g,owner,c,resolvedTargetUid,selectedImageName,cafeEffect,false,effectTargetIds)
   }
   if(furaActive&&p.board.some(unit=>unit.page===33)){draw(g,p);log(g,"Fuscão, o Agiota comprou 1 carta pelo Fura-Fila ativado.","effect")}
   if(mode==="online")g.pendingResponse=asResponse?null:{responder:owner===0?1:0,actor:owner,action:c.name,passes:0,deadline:Date.now()+(roomInfo?.settings?.responseSeconds??30)*1000};
  });
  if(mode!=="online"){if(asResponse)setSharedResponse(null);else window.setTimeout(()=>{const responder=(owner===0?1:0) as 0|1,current=currentGameRef.current;if(!current)return;const pending:PendingResponse={responder,actor:owner,action:snapshot.name,passes:0};if(mode==="bot"){const probe={...current,pendingResponse:pending} as Game;if(legalPriorityResponses(probe,responder).length===0){setSharedResponse(null);return}}setSharedResponse(pending)},1550)}
 };
 const activateAbility=(slot:number)=>{if(!game||game.active!==0)return;const p=game.players[0],d=deckById(p.heroId),key=`${d.id}-${slot}`;if(p.abilityUses[key])return;if(slot+1>p.level)return;const authoritativeId=d.id==="gimble"?(slot===1?"gimble-level-2":undefined):d.id==="saymon"?(slot===0?"saymon-level-1":slot===1?"saymon-level-2":undefined):d.id==="ngoro"?(slot===1?"ngoro-level-2":slot===2?"ngoro-level-3":undefined):d.id==="natureza"?(slot===0?"natureza-level-1":slot===2?"natureza-level-3":undefined):undefined;if(authoritativeId){void runRulesCommand({type:"activateHero",abilityId:authoritativeId},0);return}};
 const activateSupport=(uid:string)=>{const card=game?.players[0].support.find(x=>x.uid===uid)||game?.players[0].board.find(x=>x.uid===uid);if(!card||game?.active!==0||game.phase!=="principal"||!canActivateUnit(game.players[0],card))return;const structured=activatedUnitAbility(card),compiled=card.abilities?.some(ability=>ability.trigger==="activated")?card:canonicalUnit(card),markerCost=structured?.costs?.some((cost:any)=>cost.type==="removeMarkers"&&cost.amount==="X")?markerAmount(card):undefined;if(structured&&canExecuteCard(compiled)){void runRulesCommand({type:"activate",sourceId:uid,abilityId:structured.id,markerAmount:markerCost},0);return}if(mode==="online"){setRoomError("Esta habilidade ainda não possui execução autoritativa.");return}showFx("ability","HABILIDADE DE CONSTANTE",card.name,baseCard(card));update(g=>{const p=g.players[0],current=p.support.find(x=>x.uid===uid)||p.board.find(x=>x.uid===uid);if(!current||!canActivateUnit(p,current))return;current.activatedThisTurn=true;const exhaust=()=>{if(current.exhausted){log(g,`${current.name} já foi virada ou usada neste turno.`,"danger");return false}if(current.summoning&&/\bvire\b/i.test(current.text)){log(g,`${current.name} acabou de entrar em campo e não pode ser virada neste turno.`,"danger");return false}current.exhausted=true;return true},destroySelf=()=>{const sourceId=current.uid,live=p.support.find(x=>x.uid===sourceId)||p.board.find(x=>x.uid===sourceId);if(!live)return;p.support=p.support.filter(x=>x.uid!==sourceId);p.board=p.board.filter(x=>x.uid!==sourceId);sendToGrave(g,p,live);log(g,`${live.name} foi destruído depois que seu efeito terminou de resolver.`,"danger")};if(current.page===229){if(!exhaust())return;if(!summonImage(g,0,"Café Expresso","hand"))current.exhausted=false;return}if(current.page===39){if(current.markers<5){log(g,`${current.name} precisa de 5 marcadores; possui ${current.markers}.`,"danger");return}if(summonImage(g,0,"SUPER MEGATANQUE CHUMBO 3000","field",true))current.markers-=5;return}if(current.page===20||current.page===306){if(!exhaust())return;p.maxEnergy=Math.min(10,p.maxEnergy+1);p.energy=Math.min(10,p.energy+1);destroySelf();log(g,`${current.name} foi destruído e aumentou o limite de energia máxima em 1.`,"energy");return}if(current.page===60||current.page===235){if(!exhaust())return;p.reserve=3;destroySelf();log(g,`${current.name} foi destruído e preencheu a Reserva.`,"energy");return}if(current.page===153){if(!exhaust())return;p.energy+=2;destroySelf();log(g,`${current.name} foi destruído e concedeu 2 de energia neste turno.`,"energy");return}if(current.page===267){if(!exhaust())return;const hasChaos=[...p.board,...p.support].some(x=>x.uid!==current.uid&&(/caos/i.test(x.text+x.tags.join(" "))||deckById(p.heroId).faction==="Caos"));if(!hasChaos){current.exhausted=false;log(g,`${current.name} exige ao menos uma constante de Caos.`,"danger");return}p.energy+=1;log(g,`${current.name} adicionou 1 energia até o fim do turno.`,"energy");return}const tap=/\bvire\b/i.test(current.text),remove=current.text.match(/remova\s+(\d+)\s+marcador/i);if(tap&&!exhaust())return;if(remove){const amount=Number(remove[1]);if((current.markers||0)<amount){if(tap)current.exhausted=false;log(g,`${current.name} precisa de ${amount} marcadores para ativar este efeito.`,"danger");return}current.markers=(current.markers||0)-amount}resolveText(g,0,current);log(g,`${current.name} ativou seu efeito de ${tap?"Vire":remove?"Remova marcadores":"custo"}.`,"effect")});setSharedResponse({responder:1,actor:0,action:`habilidade de ${card.name}`})};
 const applyTarget=(uid:string)=>{if(!targeting||!game)return;const t=targeting,card=["spell","elemental-optional"].includes(t.kind)?game.players[0].hand[t.cardIndex!]:undefined,targetPlayer=game.players.find(p=>p.board.some(x=>x.uid===uid)||p.support.some(x=>x.uid===uid)||p.terrain?.uid===uid),targetUnit=targetPlayer&&(targetPlayer.board.find(x=>x.uid===uid)||targetPlayer.support.find(x=>x.uid===uid)||(targetPlayer.terrain?.uid===uid?targetPlayer.terrain:undefined));if(t.kind==="tranqueira-attach"){if(!t.sourceUid||!t.allowedIds?.includes(uid)||targetPlayer!==game.players[0]||!targetUnit||!hasFaction(targetUnit,"Goblin")){update(g=>log(g,"Escolha um Goblin aliado válido para receber o TRAMBUCO DO PIPOCO.","danger"));return}setTargeting(null);update(g=>{const source=g.players[0].support.find(card=>card.uid===t.sourceUid&&card.page===46);if(!source)return;(source as any).chosenTranqueiraHostUid=uid;const next=tranqueiraAttachmentChoice(g,0);if(next){queueMicrotask(()=>setTargeting({kind:"tranqueira-attach",source:"TRANQUEIRA-MÁTICA · escolha o Goblin que receberá TRAMBUCO DO PIPOCO",sourceUid:next.sourceUid,allowedIds:next.allowedIds}));return}finalizeLocalTurnState(g,0)});return}if(t.kind==="elemental-optional"){if(!targetUnit||targetUnit.type!=="Criatura"){update(g=>log(g,"O aprimoramento elemental só pode alvejar uma criatura.","danger"));return}playCard(t.cardIndex!,0,undefined,undefined,undefined,!!t.response,t.fieldSlot,t.chosenElement,undefined,uid);setTargeting(null);return}if(card){const policy=playTargetPolicy(card),selected=t.selected||[],stepIndex=selected.length,step:any=policy.steps?.[stepIndex]||{scope:policy.scope,role:"effect"},targetOwner=uid==="ally-hero"?0:uid==="enemy-hero"?1:targetPlayer===game.players[0]?0:1,targetKind=uid.endsWith("-hero")?"hero":"creature";if(!isValidTarget(step,0,targetOwner,targetKind)){update(g=>log(g,"Esse alvo não atende ao delimitador do efeito.","danger"));return}if(step.requiresDamagedOwnerThisTurn&&targetUnit&&!(targetUnit.damagedOwnersThisTurn||[]).includes(0)){update(g=>log(g,`${targetUnit.name} não causou dano a você ou a uma criatura sua neste turno.`,"danger"));return}if(step.requiresEffectAppliedThisTurn&&targetUnit&&(targetUnit as any).effectAppliedRound!==game.round){update(g=>log(g,`${targetUnit.name} ainda não recebeu um efeito aplicado neste turno.`,"danger"));return}if(step.requiresMarker&&targetUnit&&Number(typeof targetUnit.markers==="number"?targetUnit.markers:Object.values(targetUnit.markers||{}).reduce((sum,value)=>sum+Number(value||0),0))<1){update(g=>log(g,`${targetUnit.name} não possui marcadores para mover.`,"danger"));return}if(step.allowedIds?.length&&!step.allowedIds.includes(uid)){update(g=>log(g,"Esse alvo não pertence às opções válidas deste efeito.","danger"));return}const subtype=step.role==="effect"?targetSubtype(card):undefined;if(subtype&&targetUnit&&!hasSubtype(targetUnit,subtype)){update(g=>log(g,`${targetUnit.name} não possui o subtipo ${subtype}.`,"danger"));return}if(selected.includes(uid)){update(g=>log(g,"Escolha outro alvo para esta instância do efeito.","danger"));return}if(targetUnit&&hasKeyword(targetPlayer,targetUnit,"Barreira Mágica")&&!/ignora.*barreira mágica/i.test(card.text)){update(g=>log(g,`${targetUnit.name} não pode ser selecionada: Barreira Mágica está ativa.`,"danger"));return}const next=[...selected,uid],required=t.required||policy.selections||1;if(next.length<required){setTargeting({...t,selected:next,required,source:`${card.name} · alvo ${next.length+1} de ${required}`});return}playCard(t.cardIndex!,0,next[0],undefined,undefined,!!t.response,t.fieldSlot,t.chosenElement,next);setTargeting(null);return}if(t.kind==="attach"){playCard(t.cardIndex!,0,uid,undefined,undefined,!!t.response,t.fieldSlot);setTargeting(null);return}if(t.kind==="uruk-fire"){setTargeting(null);endTurn(uid);return}showFx("ability","HABILIDADE ATIVA",t.source);update(g=>{const p=g.players[0],o=g.players[1],key=`${p.heroId}-${t.kind==="saymon-life"?1:t.kind==="ngoro"?2:t.kind==="gimble"?1:0}`;if(t.kind==="gimble"){const u=p.board.find(x=>x.uid===uid&&hasFaction(x,"Dragão")&&x.exhausted);if(!u)return;u.exhausted=false;p.abilityUses[key]=1;log(g,`Gimble desvirou ${u.name}.`,"effect")}else if(t.kind==="natureza"){const u=p.board.find(x=>x.uid===uid);if(!u)return;u.markers+=2;p.heroXP+=2;p.abilityUses[key]=1;log(g,`${u.name} recebeu 2 marcadores de ação.`,"effect")}else if(t.kind==="saymon"){if(p.life<=2)return;p.life-=2;p.heroXP++;if(uid==="enemy-hero")o.life-=1;else{const u=o.board.find(x=>x.uid===uid);if(!u)return;u.damage+=1}p.abilityUses[key]=1;log(g,"Saymon pagou 2 de vida e causou 1 de dano.","damage")}else if(t.kind==="saymon-life"){const u=p.board.find(x=>x.uid===uid);if(!u||p.life<=2)return;p.life-=2;if(!u.tags.includes("Roubo de Vida"))u.tags.push("Roubo de Vida");p.abilityUses[key]=1;log(g,`${u.name} recebeu Roubo de Vida.`,"effect")}else if(t.kind==="ngoro"){const u=p.board.find(x=>x.uid===uid);if(!u||p.heroXP<3)return;p.heroXP-=3;if(!u.tags.includes("Furtivo"))u.tags.push("Furtivo");p.abilityUses[key]=1;log(g,`${u.name} recebeu Furtivo neste turno.`,"effect")}});setSharedResponse({responder:1,actor:0,action:t.source});setTargeting(null)};
 const levelUp=()=>{if(!game||game.active!==0)return;const p=game.players[0],targets=levelTargets(p),need=targets[p.level-1]??999,cost=p.level===1?2:3,progress=heroEvolutionProgress(p);if(p.level>=3||progress<need||p.energy+p.reserve<cost||p.levelUpsThisTurn>0)return;void runRulesCommand({type:"evolveHero"},0)};
 const legalDefenders=(attacker:Unit|undefined,attackerPlayer:Player,defenderPlayer:Player)=>{if(!attacker||hasKeyword(attackerPlayer,attacker,"Furtivo"))return[];return defenderPlayer.board.filter(defender=>!defender.exhausted&&(!defender.stunned||defender.suffocated)&&!attacker.combatRestrictions?.some(rule=>rule.cannotCombatSubtype&&hasSubtype(defender,rule.cannotCombatSubtype))&&!defender.combatRestrictions?.some(rule=>rule.cannotCombatSubtype&&hasSubtype(attacker,rule.cannotCombatSubtype))&&!(/não pode (bloquear|defender)/i.test(defender.text)&&!defender.suffocated)&&defender.defenseUses<defenderCapacity(defenderPlayer,defender)&&(!hasKeyword(attackerPlayer,attacker,"Voar")||hasKeyword(defenderPlayer,defender,"Voar"))) };
 const beginAttack=(owner:0|1,attackerUid:string)=>{const pending=mode==="online"?game?.pendingResponse:responseWindow;if(!game||game.phase!=="combate"||game.active!==owner||combatAction||pending||presentationBusy)return;const attacker=game.players[owner].board.find(x=>x.uid===attackerUid),attacksUsed=attacker?.attacksThisTurn??(attacker?.attackedThisTurn?1:0);if(!attacker||attacker.exhausted||attacksUsed>=(attacker.attackLimit||1)||attacker.summoning||attacker.stunned||attacker.immobilized)return;
  const player=game.players[owner],commander=player.board.find(unit=>unit.slot===2&&!unit.suffocated);
  if(player.heroId==="tessalia"&&attacker.slot!==2&&!commander){if(mode!=="online")update(g=>log(g,"Tessália precisa de um Comandante no espaço central para atacar com outras criaturas.","danger"));return}
  setTargeting(null);
  if(mode==="online"){void runRulesCommand({type:"declareAttack",attackerId:attackerUid},owner);return}
  if(player.heroId==="tessalia"&&attacker.slot===2)update(g=>{g.players[owner].heroXP++;log(g,"O Comandante de Tessália atacou: progresso de evolução +1.","effect")});
  setSharedCombat({attackerOwner:owner,attackerUid,attackerCard:baseCard(attacker),stage:"declared"})};
 const chooseAttacker=(uid:string)=>{if(targeting)return;beginAttack(0,uid)};
 const chooseDefender=(uid:string)=>{if(!game||combatAction?.attackerOwner!==1||combatAction.stage!=="choosing")return;const attacker=game.players[1].board.find(x=>x.uid===combatAction.attackerUid),defender=game.players[0].board.find(x=>x.uid===uid);if(!attacker||!defender||!legalDefenders(attacker,game.players[1],game.players[0]).some(x=>x.uid===uid))return;if(mode==="online"){void runRulesCommand({type:"selectDefender",attackerId:combatAction.attackerUid,defenderId:uid,targetHero:false},0);return}setSharedCombat({...combatAction,targetHero:false,defenderUid:uid,defenderCard:baseCard(defender),stage:"charging"})};
 const chooseDirectDefense=()=>{if(combatAction?.attackerOwner!==1||combatAction.stage!=="choosing")return;if(mode==="online"){void runRulesCommand({type:"selectDefender",attackerId:combatAction.attackerUid,targetHero:true},0);return}setSharedCombat({...combatAction,targetHero:true,defenderUid:undefined,defenderCard:undefined,stage:"charging"})};
 const finishCombat=()=>{if(combatAction||responseWindow||!game)return;const forced=mandatoryIndomitableAttacker(game.players[0]);if(forced){update(g=>log(g,`${forced.name} é Indomável e precisa atacar antes de encerrar o combate.`,"danger"));return}setTargeting(null);setAiAttackQueue([]);void runRulesCommand({type:"advancePhase"},0)};
 const finishImageEffects=(g:Game,owner:0|1)=>{const p=g.players[owner],foe=g.players[owner===0?1:0];
 /* End-of-turn triggers resolve before temporary images leave. */
 p.board.filter(x=>x.page===84&&!x.suffocated).forEach(x=>{p.life=Math.min(30,p.life+1);log(g,"UNDARIS restaura 1 de vida no fim do turno.","heal");queueMicrotask(()=>showFx("ability","GATILHO · UNDARIS","Restaura 1 de vida.",baseCard(x)));});
 p.support.filter(x=>x.page===304&&!x.suffocated).forEach(x=>{p.life=Math.max(0,p.life-1);log(g,"RITUAL NOCTURNO causa 1 de dano no fim do turno.","damage");queueMicrotask(()=>showFx("damage","GATILHO · RITUAL","1 de dano ao controlador.",baseCard(x)));});
 p.board.filter(x=>x.page===213&&!x.suffocated).forEach(x=>{if(p.catsEnteredThisTurn===0){p.life=Math.max(0,p.life-1);log(g,"O GATO-METRO detectou que nenhum Gato entrou: 1 de dano.","damage");queueMicrotask(()=>showFx("damage","GATILHO · GATO-METRO","Nenhum Gato entrou neste turno.",baseCard(x)));}});
 const temporary=p.board.filter(x=>x.temporary||x.page===40);p.board=p.board.filter(x=>!temporary.includes(x));temporary.forEach(x=>returnImage(g,p,x,"permaneceu até o fim do turno"));const liveTranqueiras=p.support.filter(x=>x.page===46);if(liveTranqueiras.length){p.support=p.support.filter(x=>x.page!==46);liveTranqueiras.forEach(x=>sendToGrave(g,p,x));liveTranqueiras.forEach(x=>{const played=Math.max(0,Number((x as any).cardsPlayedAfterSelf||0));if(played>=7)summonImage(g,owner,"CARCAÇA CHUMBADA DE TANQUE");else if(played===6)summonImage(g,owner,"TRAMBUCO DO PIPOCO",undefined,false,(x as any).chosenTranqueiraHostUid);else if(played===5)summonImage(g,owner,"BUCHA DE CANHÃO");else if(played>0){p.life-=played;log(g,`TRANQUEIRA-MÁTICA falhou: ${p.heroId===mine?"você":"a IA"} sofreu ${played} de dano.`,"damage")}log(g,`${x.name} deixou o campo no fim do turno em que foi usada.`,"effect")});p.pendingTranqueira=false}else if(p.pendingTranqueira){const played=p.turnCardsPlayed;if(played>=7)summonImage(g,owner,"CARCAÇA CHUMBADA DE TANQUE");else if(played===6)summonImage(g,owner,"TRAMBUCO DO PIPOCO");else if(played===5)summonImage(g,owner,"BUCHA DE CANHÃO");else if(played>0){p.life-=played;log(g,`TRANQUEIRA-MÁTICA falhou: ${p.heroId===mine?"você":"a IA"} sofreu ${played} de dano.`,"damage")}p.pendingTranqueira=false}};
 /* Uruk I resolves exactly once at the end of a turn. The spell trigger keeps
    only the latest elemental spell of that turn, so it cannot replay older spells. */
 const resolveUrukLevelOne=(g:Game,owner:0|1,targetUid?:string)=>{
  const p=g.players[owner],foe=g.players[owner===0?1:0],element=p.heroId==="uruk"&&p.level>=1?p.lastElement:undefined;
  if(!element)return false;
  const heroCard=cards.find(card=>card.page===deckById(p.heroId).heroPage),spellName=p.lastElementSource||"último feitiço";
  const announce=(detail:string,target?:CardDef|Unit)=>showFx("ability",`URUK I · ${element.toUpperCase()}`,detail,heroCard,target?baseCard(target):undefined);
  if(element==="Fogo"){
   const unit=foe.board.find(card=>card.uid===targetUid)||foe.support.find(card=>card.uid===targetUid)||(foe.terrain?.uid===targetUid?foe.terrain:undefined);
   if(unit){
    announce(`${spellName} → ${unit.name}: 1 de dano`,unit);unit.damage+=1;log(g,`Uruk I ativou Fogo de ${spellName}: 1 de dano em ${unit.name}.`,"elemental");
   }else{foe.life-=1;p.damageDealt+=1;announce(`${spellName} → herói inimigo: 1 de dano`);log(g,`Uruk I ativou Fogo de ${spellName}: 1 de dano ao herói inimigo.`,"elemental")}
  }else if(element==="Terra"){draw(g,p);announce(`${spellName}: compre 1 carta`);log(g,`Uruk I ativou Terra de ${spellName}: comprou 1 carta.`,"elemental")}
  else if(element==="Água"){p.life=Math.min(30,p.life+1);announce(`${spellName}: restaure 1 de vida`);log(g,`Uruk I ativou Água de ${spellName}: restaurou 1 de vida.`,"elemental")}
  else{p.energy=Math.min(p.maxEnergy,p.energy+1);announce(`${spellName}: receba 1 de energia`);log(g,`Uruk I ativou Ar de ${spellName}: recebeu 1 de energia.`,"elemental")}
  p.lastElement=undefined;p.lastElementSource=undefined;
  return true
 };
 function tranqueiraAttachmentChoice(state:Game,owner:0|1){
  const p=state.players[owner],live=p.support.filter(card=>card.page===46),reserved=new Set(live.map(card=>(card as any).chosenTranqueiraHostUid).filter(Boolean));
  for(const source of live){
   if(Number((source as any).cardsPlayedAfterSelf||0)!==6||(source as any).chosenTranqueiraHostUid)continue;
   const allowedIds=p.board.filter(unit=>hasFaction(unit,"Goblin")&&!reserved.has(unit.uid)&&!p.support.some(support=>support.page!==46&&support.slot===unit.slot)).map(unit=>unit.uid);
   if(allowedIds.length>1)return{sourceUid:source.uid,allowedIds};
  }
  return null;
 }
 function finalizeLocalTurnState(g:Game,owner:0|1,urukTargetUid?:string){
  resolveUrukLevelOne(g,owner,urukTargetUid);finishImageEffects(g,owner);const p=g.players[owner];p.nextElementEffects=[];p.elementChain=undefined;p.goblinTurnCardsPlayed=0;bankRemainingEnergy(p);g.players.forEach(entry=>[...entry.board,...entry.support,...(entry.terrain?[entry.terrain]:[])].forEach(unit=>{unit.temporaryAtk=0;unit.temporaryHp=0;unit.temporaryTags=[];unit.modifiers=(unit.modifiers||[]).filter(modifier=>modifier.duration!=="turn");unit.combatRestrictions=(unit.combatRestrictions||[]).filter(rule=>rule.duration!=="turn");unit.damageShields=(unit.damageShields||[]).filter(shield=>shield.duration!=="turn"&&shield.expires!=="turn")}));g.active=g.active===0?1:0;g.phase="manutencao";g.round++;g.turnDeadline=Date.now()+(roomInfo?.settings?.turnSeconds??120)*1000;log(g,`Turno ${g.round}: ${deckById(g.players[g.active].heroId).name}.`,"phase");
 }
 const endTurn=(urukTargetUid?:string)=>{
  if(!game)return;
  if(mode==="online"){if(!urukTargetUid)void runRulesCommand({type:"advancePhase"},0);return}
  const activePlayer=game.players[game.active];
  if(!urukTargetUid&&activePlayer.hand.length>9){update(g=>{g.pendingDecision={kind:"hand-limit-discard",owner:g.active,effect:{amount:g.players[g.active].hand.length-9},context:{owner:g.active},sourceName:"Limite de mão"} as any});return}
  if(game.active===0&&activePlayer.heroId==="uruk"&&activePlayer.level>=1&&activePlayer.lastElement==="Fogo"&&!urukTargetUid){
   setTargeting({kind:"uruk-fire",source:"Uruk I · Fogo: escolha uma criatura inimiga ou o herói inimigo"});
   return
  }
  if(!urukTargetUid&&game.active===0){const choice=tranqueiraAttachmentChoice(game,0);if(choice){setTargeting({kind:"tranqueira-attach",source:"TRANQUEIRA-MÁTICA · escolha o Goblin que receberá TRAMBUCO DO PIPOCO",sourceUid:choice.sourceUid,allowedIds:choice.allowedIds});return}}
  update(g=>finalizeLocalTurnState(g,g.active,urukTargetUid))
 };

 useEffect(()=>{
  if(!combatAction||!game)return;let cancelled=false;const action=combatAction,defenderOwner=(action.attackerOwner===0?1:0) as 0|1;if(action.stage==="choosing"||action.stage==="priority"&&(responseWindow||targeting?.response))return;const onlineDriver=action.stage==="declared"?action.attackerOwner===0:action.stage==="priority"?action.attackerOwner===1:action.attackerOwner===0;if(mode==="online"&&!onlineDriver)return;
  const frame=requestAnimationFrame(()=>{
   const attackingPlayer=game.players[action.attackerOwner],defendingPlayer=game.players[defenderOwner],attacker=attackingPlayer.board.find(x=>x.uid===action.attackerUid);
   if(action.stage==="declared"){if(mode==="online")return;const priorityAction={...action,stage:"priority" as const};setSharedCombat(priorityAction);setSharedResponse({responder:defenderOwner,actor:action.attackerOwner,action:`declaração de ataque de ${action.attackerCard.name}`},priorityAction);return}
   if(action.stage==="priority"){
    if(!attacker){setSharedCombat({...action,stage:"resolved",result:"O atacante deixou o campo durante a resposta.",winnerText:"ATAQUE CANCELADO",destroyed:["attacker"]});return}
    const blockers=legalDefenders(attacker,attackingPlayer,defendingPlayer);if(!blockers.length){setSharedCombat({...action,targetHero:true,stage:"charging"});return}
    if(action.attackerOwner===1){setSharedCombat({...action,stage:"choosing"});return}
    void loadAdvancedAIRuntime().then(({chooseAdvancedAIBlock})=>{if(cancelled)return;const blockPlan=chooseAdvancedAIBlock(game,defenderOwner,attacker,difficulty);if(blockPlan.takeDamage||!blockPlan.defenderId){setSharedCombat({...action,targetHero:true,stage:"charging"});return}const defender=blockers.find(unit=>unit.uid===blockPlan.defenderId)||[...blockers].sort((a,b)=>currentHp(a,defendingPlayer)-currentHp(b,defendingPlayer))[0];setSharedCombat({...action,targetHero:false,defenderUid:defender.uid,defenderCard:baseCard(defender),stage:"charging"})});return
   }
   if(action.stage==="charging"){setSharedCombat({...action,stage:"impact"});return}
   if(action.stage==="impact"){
    if(!attacker){setSharedCombat({...action,stage:"resolved",result:"O atacante deixou o campo.",winnerText:"ATAQUE CANCELADO",destroyed:["attacker"]});return}
    if(mode==="online"){
     const defenderId=action.targetHero?undefined:action.defenderUid;
     void runRulesCommand({type:"attack",attackerId:action.attackerUid,defenderId},action.attackerOwner).then(accepted=>{
      if(accepted){setCombatAction({...action,stage:"resolved",targetHero:action.targetHero,defenderUid:action.defenderUid,result:action.targetHero?"Dano direto resolvido pelo servidor":"Combate resolvido pelo servidor",winnerText:"COMBATE RESOLVIDO"})}
      else setCombatAction({...action,stage:"resolved",result:"O servidor recusou o ataque.",winnerText:"ATAQUE CANCELADO"});
     });
     return
    }
    const defender=defendingPlayer.board.find(x=>x.uid===action.defenderUid),targetHero=action.targetHero||!defender;
    const attackDamage=currentAtk(attacker,attackingPlayer),counterDamage=defender?currentAtk(defender,defendingPlayer):undefined;
    void runRulesCommand({type:"attack",attackerId:action.attackerUid,defenderId:defender?.uid,skipPriority:true},action.attackerOwner).then(accepted=>{
     if(!accepted){setSharedCombat({...action,stage:"resolved",result:"O motor de regras recusou o ataque.",winnerText:"ATAQUE CANCELADO"});return}
     const resolved=currentGameRef.current,attackerAlive=!!resolved?.players[action.attackerOwner].board.some(unit=>unit.uid===action.attackerUid),defenderAlive=!defender||!!resolved?.players[defenderOwner].board.some(unit=>unit.uid===defender.uid),destroyed:Array<"attacker"|"defender">=[];
     if(!attackerAlive)destroyed.push("attacker");if(defender&&!defenderAlive)destroyed.push("defender");
     const winnerText=!attackerAlive&&!defenderAlive?"AMBAS FORAM DESTRUÍDAS":defender&&!defenderAlive?`${attacker.name} VENCEU O CONFRONTO`:!attackerAlive?`${defender?.name||"O defensor"} VENCEU O CONFRONTO`:targetHero?"DANO DIRETO AO HERÓI":"AMBAS SOBREVIVERAM";
     setSharedCombat({...action,targetHero,defenderUid:defender?.uid,defenderCard:defender?baseCard(defender):undefined,stage:"resolved",attackDamage,counterDamage,destroyed,winnerText,result:targetHero?`${attackDamage} de dano direto`:`${attackDamage} × ${counterDamage||0}`})
    });return
   }
   setSharedCombat(null)
  });return()=>{cancelled=true;cancelAnimationFrame(frame)}
 },[combatAction,game,responseWindow,targeting,difficulty,mode]);

 useEffect(()=>{
  const decision=game?.pendingDecision;if(!game||presentationBusy||mode!=="bot"||!decision||(decision.owner!==1&&decision.context?.decisionOwner!==1))return;
  const decisionKey=`${game.round}:${game.events}:${decision.kind}`;
  const timer=window.setTimeout(()=>{void loadAdvancedAIRuntime().then(({chooseAdvancedAIDecision})=>chooseAdvancedAIDecision(game,1,difficulty)).then(command=>{const current=currentGameRef.current,currentDecision=current?.pendingDecision;if(!command||!current||`${current.round}:${current.events}:${currentDecision?.kind||""}`!==decisionKey)return;void runRulesCommand(command,1)})},120);
  return()=>window.clearTimeout(timer)
 },[game,mode,difficulty,presentationBusy]);

 useEffect(()=>{
  if(!game||presentationBusy||game.active!==1||game.winner!==null||mode!=="bot"||responseWindow||combatAction||game.pendingDecision||game.pendingReposition||game.phase==="combate")return;
  const timer=window.setTimeout(()=>{
   if(game.phase==="manutencao"){
    update(g=>{const p=g.players[1];if(!p.deck.length){p.life=0;log(g,`${deckById(p.heroId).name} iniciou a Manutenção com o Deck vazio e perdeu a partida.`,"danger");return}p.board.forEach(u=>{u.damage=0;u.summoning=false;u.activatedThisTurn=false;u.attackedThisTurn=false;u.attacksThisTurn=0;u.defenseUses=0;if(u.immobilized){u.exhausted=true;u.immobilized=false}else u.exhausted=false;u.stunned=false;u.frozen=false;u.suffocated=false});p.support.forEach(u=>{u.exhausted=false;u.summoning=false;u.activatedThisTurn=false});resetTurnState(p);p.maxEnergy=Math.min(10,p.maxEnergy+1);draw(g,p);p.energy=p.maxEnergy;resolveMaintenanceTriggers(g,1);g.phase="principal";queueCafeDoTempoPlacement(g);log(g,"A IA concluiu a manutenção.","phase")});return
   }
   const player=game.players[1],searchKey=`${game.round}:${game.events}:${game.phase}:${player.hand.length}:${player.energy}:${player.reserve}`;
   void loadAdvancedAIRuntime().then(({chooseAdvancedAIAction})=>chooseAdvancedAIAction(game,1,difficulty)).then(command=>{
    const current=currentGameRef.current,currentPlayer=current?.players?.[1],currentKey=current&&currentPlayer?`${current.round}:${current.events}:${current.phase}:${currentPlayer.hand.length}:${currentPlayer.energy}:${currentPlayer.reserve}`:"";
    if(!command||currentKey!==searchKey||current?.winner!=null||current?.pendingDecision||current?.pendingResponse)return;
    void runRulesCommand(command,1)
   })
  },80);
  return()=>window.clearTimeout(timer)
 },[game,mode,difficulty,responseWindow,combatAction,presentationBusy]);

 useEffect(()=>{
  if(!game||mode!=="bot"||game.active!==1||game.phase!=="combate"||game.winner!==null||combatAction||responseWindow||presentationBusy)return;
  const attackKey=`${game.round}:${game.events}:${game.phase}`;const t=setTimeout(()=>{
   const legal=orderAIAttackers(game.players[1],difficulty) as Unit[],legalIds=new Set(legal.map(unit=>unit.uid));
   void loadAdvancedAIRuntime().then(({planAdvancedAIAttacks})=>planAdvancedAIAttacks(game,1,difficulty)).then(plannedAttacks=>{const current=currentGameRef.current;if(!current||`${current.round}:${current.events}:${current.phase}`!==attackKey)return;const planned=plannedAttacks.filter(uid=>legalIds.has(uid));
   const queued=aiAttackQueue.find(uid=>legalIds.has(uid)&&planned.includes(uid));
   if(queued){setAiAttackQueue(aiAttackQueue.filter(uid=>uid!==queued));beginAttack(1,queued);return}
   const ready=planned;
   if(ready.length){setAiAttackQueue(ready.slice(1));beginAttack(1,ready[0]);return}
   setAiAttackQueue([]);update(g=>{if(g.active===1&&g.phase==="combate"){g.players.forEach(player=>player.board.forEach(unit=>{if(unit.defenseUses>0)unit.exhausted=true}));g.phase="fim";log(g,"A IA encerrou a etapa de combate.","phase")}})});
  },180);
  return()=>clearTimeout(t);
 },[game,mode,difficulty,combatAction,responseWindow,aiAttackQueue,presentationBusy]);

 useEffect(()=>{const authoritativePending=game?.pendingResponse;if(authoritativePending?.responder!==1||mode!=="bot")return;const pendingKey=`${authoritativePending.actor}:${authoritativePending.responder}:${authoritativePending.passes??0}:${authoritativePending.action}`;const snapshot=currentGameRef.current;if(!snapshot||snapshot.winner!==null||snapshot.pendingResponse?.responder!==1)return;const delay=(authoritativePending.passes??0)>0?40:legalPriorityResponses(snapshot,1).length?90:40;const act=()=>{const current=currentGameRef.current;if(!current||current.winner!==null||mode!=="bot")return;const pending=current.pendingResponse;if(!pending||pending.responder!==1)return;const currentKey=`${pending.actor}:${pending.responder}:${pending.passes??0}:${pending.action}`;if(currentKey!==pendingKey)return;const fallback=async()=>{await passPriorityWindow(1,true)};if(pending.actor===1&&(pending.passes??0)>0){void fallback();return}void loadAdvancedAIRuntime().then(({chooseAdvancedAIResponse})=>chooseAdvancedAIResponse(current,1,difficulty)).then(command=>{const latest=currentGameRef.current,latestPending=latest?.pendingResponse;if(!latest||!latestPending||latestPending.responder!==1)return;const latestKey=`${latestPending.actor}:${latestPending.responder}:${latestPending.passes??0}:${latestPending.action}`;if(latestKey!==pendingKey)return;if(command.type==="passPriority"){void fallback();return}void runRulesCommand(command,1).then(accepted=>{if(!accepted)void fallback()})})};const t=setTimeout(act,delay);/* Last-resort progress guard: a failed search must never leave the match locked. */const watchdog=setTimeout(()=>{const current=currentGameRef.current,pending=current?.pendingResponse;if(!current||pending?.responder!==1)return;const currentKey=`${pending.actor}:${pending.responder}:${pending.passes??0}:${pending.action}`;if(currentKey===pendingKey)void passPriorityWindow(1,true)},3200);return()=>{clearTimeout(t);clearTimeout(watchdog)}},[game?.pendingResponse?.actor,game?.pendingResponse?.responder,game?.pendingResponse?.passes,game?.pendingResponse?.action,mode,difficulty]);
 const responseBudget=(state:Game,owner:0|1)=>state.active===owner?state.players[owner].energy+state.players[owner].reserve:state.players[owner].reserve;
 const legalAcceleratedResponseCommands=(state:Game,owner:0|1=0)=>legalPriorityResponses(state,owner).filter((command:any)=>command.type==="playCard");
 const hasUsableAcceleratedResponse=(state:Game,owner:0|1=0)=>legalAcceleratedResponseCommands(state,owner).length>0;
 const usableAcceleratedResponses=(state:Game,owner:0|1=0)=>{const player=state.players[owner],legalIds=new Set(legalAcceleratedResponseCommands(state,owner).map((command:any)=>String(command.cardId)));return player.hand.map((card,index)=>({card,index,cost:effectiveCost(card,player)})).filter(({card})=>legalIds.has(card.id))};
 const heroPriorityResponses=(state:Game,owner:0|1=0)=>legalPriorityResponses(state,owner).filter((command:any)=>command.type==="activateHero").map((command:any)=>{const slot=command.abilityId==="gimble-level-2"?1:command.abilityId==="saymon-level-1"?0:command.abilityId==="saymon-level-2"?1:command.abilityId==="ngoro-level-2"?1:command.abilityId==="ngoro-level-3"?2:command.abilityId==="natureza-level-1"?0:command.abilityId==="natureza-level-3"?2:-1;return{abilityId:command.abilityId,label:slot>=0?deckById(state.players[owner].heroId).abilities[slot]:command.label||"Habilidade do Herói"}});
 const hasUsablePriorityResponse=(state:Game,owner:0|1=0)=>hasUsableAcceleratedResponse(state,owner)||heroPriorityResponses(state,owner).length>0;
 const localPriorityOptions=useMemo(()=>game?usableAcceleratedResponses(game,0):[],[game]);
 const localHeroPriorityOptions=useMemo(()=>game?heroPriorityResponses(game,0):[],[game]);
 const presentationBlocked=presentationBusy||!!visualFx||visualFxQueue.length>0||shufflingDeck!==null;
 const visibleResponseWindow=presentationBlocked?null:responseWindow;
 const priorityInteractionActive=!!(game?.pendingResponse||responseWindow||game?.pendingAction||game?.priorityStack?.length||(combatAction&&["declared","priority"].includes(combatAction.stage))||targeting?.response);
 const priorityControl=usePriorityControl({interactionActive:priorityInteractionActive,pendingResponse:visibleResponseWindow,hasUsableResponse:localPriorityOptions.length>0||localHeroPriorityOptions.length>0,getCurrentPending:()=>presentationBlocked?null:currentGameRef.current?.pendingResponse??null,onAutoPass:()=>passPriorityWindow(0,true)});
 useEffect(()=>{const pending=game?.pendingResponse;if(presentationBusy||mode!=="bot"||pending?.responder!==0||!pending.deadline)return;const key=`${pending.actor}:${pending.responder}:${pending.passes??0}:${pending.action}:${pending.deadline}`;const expire=()=>{const current=currentGameRef.current?.pendingResponse,currentKey=current?`${current.actor}:${current.responder}:${current.passes??0}:${current.action}:${current.deadline??0}`:"";if(currentKey===key)void passPriorityWindow(0,true)};const delay=pending.deadline-Date.now();if(delay<=0){expire();return}const timer=window.setTimeout(expire,delay+25);return()=>window.clearTimeout(timer)},[presentationBusy,mode,game?.pendingResponse?.actor,game?.pendingResponse?.responder,game?.pendingResponse?.passes,game?.pendingResponse?.action,game?.pendingResponse?.deadline]);

 const selectedDeck=deckById(mine),activeUserDeck=userDecks[mine]??defaultUserDeck(mine,cards,selectedDeck.name),deckValidation=validateUserDeck(activeUserDeck,cards);
 const selectedPool=useMemo<CardDef[]>(()=>activeUserDeck.main.flatMap(entry=>{const card=cards.find(candidate=>candidate.id===entry.cardId);return card?[{...card,collectionQuantity:entry.quantity}]:[]}),[activeUserDeck]);
 const selectedExtra=useMemo(()=>activeUserDeck.extra.map(cardId=>cards.find(card=>card.id===cardId)).filter((card):card is CardDef=>!!card),[activeUserDeck]);
 const mainDeckCopies=deckValidation.mainCount,deckListValid=deckValidation.ok;
 const [filteredSelectedPool,filteredSelectedExtra]=useMemo(()=>{const query=cleanName(deferredCollectionQuery.trim()),matches=(card:CardDef)=>(collectionType==="Todas"||card.type===collectionType)&&(!query||cleanName(`${card.name} ${card.type} ${card.text} ${(card.tags||[]).join(" ")} ${(card.subtypes||[]).join(" ")}`).includes(query));return[selectedPool.filter(matches),selectedExtra.filter(matches)]},[selectedPool,selectedExtra,deferredCollectionQuery,collectionType]);
 const myRoomParticipant=isHost?roomInfo?.host:roomInfo?.guest;
 const opponentRoomParticipant=isHost?roomInfo?.guest:roomInfo?.host;
 const winnerDeck=game?.winner!=null?deckById(game.players[game.winner].heroId):null;
 const winnerDisplayName=winnerDeck?`${mode==="bot"&&game?.winner===1?"(IA) ":""}${winnerDeck.name}`:"";
 const reconnectDeadline=(opponentRoomParticipant?.disconnectedAt??0)+60000;
 const opponentReconnecting=mode==="online"&&(roomInfo?.status==="mulligan"||roomInfo?.status==="started")&&!!opponentRoomParticipant?.disconnectedAt;
 const myReconnectDeadline=(myRoomParticipant?.disconnectedAt??0)+60000;
 const reconnectingSelf=mode==="online"&&(roomInfo?.status==="mulligan"||roomInfo?.status==="started")&&!!myRoomParticipant?.disconnectedAt;
 const priorityLocked=(mode==="online"&&game?.pendingResponse?.actor===0)||opponentReconnecting||reconnectingSelf||onlineCommandPending;
 const defenseChoice=!!combatAction&&combatAction.attackerOwner===1&&combatAction.stage==="choosing";
 const mandatoryAttacker=useMemo(()=>game?.phase==="combate"&&me?mandatoryIndomitableAttacker(me):null,[game?.phase,me]);
 const defendingAgainst=defenseChoice&&game?game.players[1].board.find(unit=>unit.uid===combatAction?.attackerUid):undefined;
 const defenseTargets=defenseChoice&&game&&defendingAgainst?legalDefenders(defendingAgainst,game.players[1],game.players[0]).map(unit=>unit.uid):undefined;
 const heroAbilityTargetIds=targeting?.kind==="gimble"&&game?game.players[0].board.filter(unit=>hasFaction(unit,"Dragão")&&unit.exhausted).map(unit=>unit.uid):undefined;
 const tranqueiraTargetIds=targeting?.kind==="tranqueira-attach"?targeting.allowedIds:undefined;
 const baseLocalTargetableCreatureIds=defenseChoice?defenseTargets:(tranqueiraTargetIds??heroAbilityTargetIds);
 const allyTarget=(!!targeting&&["attach","elemental-optional","gimble","natureza","saymon-life","ngoro","tranqueira-attach"].includes(targeting.kind))||((!!targeting&&["spell","elemental-optional"].includes(targeting.kind)&&!!game)?["ally","any"].includes(targetRule(game.players[0].hand[targeting.cardIndex!]||cards[0],targeting.selected?.length||0)):false);
 const enemyTarget=(!!targeting&&["saymon","uruk-fire","elemental-optional"].includes(targeting.kind))||((!!targeting&&["spell","elemental-optional"].includes(targeting.kind)&&!!game)?["enemy","any"].includes(targetRule(game.players[0].hand[targeting.cardIndex!]||cards[0],targeting.selected?.length||0)):false);
 /* Texto Colado has priority: unrestricted damage and healing may select heroes;
    creature-only and permanent-only effects may not. */
 const targetCard=!!targeting&&["spell","elemental-optional"].includes(targeting.kind)&&game?game.players[0].hand[targeting.cardIndex!]:undefined;
 const targetPolicyStep:any=targetCard?playTargetPolicy(targetCard).steps?.[targeting?.selected?.length||0]:undefined;
 const conditionalSpellTargetIds=targetPolicyStep&&game&&(targetPolicyStep.requiresDamagedOwnerThisTurn||targetPolicyStep.requiresEffectAppliedThisTurn||targetPolicyStep.requiresMarker||targetPolicyStep.allowedIds?.length)?game.players.flatMap(player=>player.board.filter(unit=>(!targetPolicyStep.requiresDamagedOwnerThisTurn||(unit.damagedOwnersThisTurn||[]).includes(0))&&(!targetPolicyStep.requiresEffectAppliedThisTurn||(unit as any).effectAppliedRound===game.round)&&(!targetPolicyStep.requiresMarker||Number(typeof unit.markers==="number"?unit.markers:Object.values(unit.markers||{}).reduce((sum,value)=>sum+Number(value||0),0))>0)&&(!targetPolicyStep.allowedIds?.length||targetPolicyStep.allowedIds.includes(unit.uid))).map(unit=>unit.uid)):undefined;
 const localTargetableCreatureIds=baseLocalTargetableCreatureIds??conditionalSpellTargetIds;
 const enemyHeroTarget=targeting?.kind==="saymon"||targeting?.kind==="uruk-fire"||(targeting?.kind==="spell"&&allowsHeroTarget(targetCard,targeting?.selected?.length||0)&&enemyTarget);
 const allyHeroTarget=targeting?.kind==="spell"&&allowsHeroTarget(targetCard,targeting?.selected?.length||0)&&allyTarget;
 const currentScope=targeting?.kind==="elemental-optional"?TargetScope.ANY_CREATURE:targetCard?targetScopeAt(targetCard,targeting?.selected?.length||0):TargetScope.NONE,permanentTarget=[TargetScope.ANY_PERMANENT,TargetScope.ALLY_PERMANENT,TargetScope.ENEMY_PERMANENT].includes(currentScope),allyPermanentTarget=allyTarget&&permanentTarget,enemyPermanentTarget=enemyTarget&&permanentTarget;
 const chooseResponse=(idx:number)=>{if(!game)return;const c=game.players[0].hand[idx],policy=c?playTargetPolicy(c):undefined;if(!c||!isFast(c)||effectiveCost(c,game.players[0])>responseBudget(game,0))return;if(policy&&policy.selections>0){if(!canChooseAllTargets(c,policy.steps||[])){update(g=>log(g,`${c.name} não pode responder porque não existem alvos válidos.`,"danger"));return}setResponseWindow(null);setTargeting({kind:c.type==="Artefato"?"attach":"spell",source:`Resposta: ${c.name}`,cardIndex:idx,response:true,required:policy.selections,selected:[]});return}playCard(idx,0,undefined,undefined,undefined,true)};
 const chooseHeroResponse=(abilityId:string)=>{if(!game)return;const command=legalPriorityResponses(game,0).find((candidate:any)=>candidate.type==="activateHero"&&candidate.abilityId===abilityId);if(command)void runRulesCommand(command,0)};
 const declineResponse=()=>{void passPriorityWindow(0)};
 const engineDecision=presentationBlocked?null:game?.pendingDecision,decisionForLocal=!!engineDecision&&engineDecision.owner===0;
 const decisionEffectLabel=(effect:any)=>effect?.type==="selectFirstAct"?`Ativar Primeiro Ato de ${effect.name}`:effect?.type==="investigate"?`Investigar ${effect.amount||1} no ${effect.target==="opponentDeck"?"deck adversário":"seu deck"}`:effect?.type==="createImagesAcrossFields"?`Criar ${effect.amount||1} Gatos Multidimensionais`:effect?.type==="levelHero"?"Subir o herói de nível":effect?.type==="draw"?`Comprar ${effect.amount||1} carta(s)`:effect?.type==="mill"?`Triturar ${effect.amount||1} carta(s)`:effect?.type==="loseLife"?`Perder ${effect.amount||1} de vida`:effect?.type==="moveTopToBottom"?"Mover o topo para o fundo":effect?.type==="heal"?`Restaurar ${effect.amount||1} de vida`:effect?.type==="damage"?`Causar ${effect.amount||1} de dano`:"Aplicar o efeito";
 const resolveEngineChoice=(choiceIndex:number)=>{if(!decisionForLocal)return;const selectedCardId=engineDecision.kind==="replay-ability"?engineDecision.effect.choices?.[choiceIndex]?.[0]?.id:undefined;void runRulesCommand({type:"resolveDecision",choiceIndex,selectedCardId},0)};
 const sacrificeDecision=engineDecision?.kind==="optional-sacrifice-buff";
 const imagePlacementDecision=!!engineDecision&&engineDecision.kind==="image-placement"&&engineDecision.owner===0;
 const imagePlacementTargetOwner=imagePlacementDecision?Number(engineDecision.effect.targetOwner):-1;
 const imagePlacementCreatureSlots=imagePlacementDecision?(engineDecision.effect.creatureSlots||[]):[];
 const imagePlacementSupportSlots=imagePlacementDecision?(engineDecision.effect.supportSlots||[]):[];
 const chooseImagePlacement=(slot:number,zone:"creature"|"support")=>{if(!imagePlacementDecision)return;void runRulesCommand({type:"resolveDecision",slot,placementZone:zone},0)};
 const engineTargetDecision=!!engineDecision&&["targets","activation-targets"].includes(engineDecision.kind);
 const engineTargetStep=engineTargetDecision?engineDecision.targetSteps?.[engineTargetSelection.length]:undefined;
 const engineTargetOptions=engineTargetStep&&game?game.players.flatMap((player,targetOwner)=>[...player.board.map(unit=>({id:unit.uid,label:unit.name,kind:"creature",card:unit as CardDef})),...player.support.map(unit=>({id:unit.uid,label:unit.name,kind:"permanent",card:unit as CardDef})),...(player.terrain?[{id:player.terrain.uid,label:player.terrain.name,kind:"permanent",card:player.terrain as CardDef}]:[]),{id:targetOwner===0?"ally-hero":"enemy-hero",label:`Herói: ${heroDisplayName(player.heroId)}`,kind:"hero",card:cards.find(card=>card.page===deckById(player.heroId).heroPage)!}].filter(option=>isValidTarget(engineTargetStep,0,targetOwner,option.kind)&&(!engineTargetStep.requiredSubtype||hasSubtype(option.card,engineTargetStep.requiredSubtype))&&(!engineTargetStep.requiredName||cleanName(option.card.name)===cleanName(engineTargetStep.requiredName))&&(!engineTargetStep.imageOnly||!!(option.card as any).generatedImage||!!(option.card as any).imageCard)&&(engineTargetStep.maxCost==null||option.card.cost<=engineTargetStep.maxCost)&&(!engineTargetStep.requiresEffectAppliedThisTurn||(option.card as any).effectAppliedRound===game.round)&&(!engineTargetStep.requiresMarker||Number(typeof (option.card as any).markers==="number"?(option.card as any).markers:Object.values((option.card as any).markers||{}).reduce((sum:any,value:any)=>sum+Number(value||0),0))>0)&&(!engineTargetStep.allowedIds?.length||engineTargetStep.allowedIds.includes(option.id))&&!(engineTargetStep.excludeIds||[]).includes(option.id)&&!engineTargetSelection.includes(option.id))):[];
 const engineTargetIds=engineTargetOptions.map(option=>option.id);
 const engineTargetConsequence=(engineDecision?.effect?.replayEffects||[]).map(decisionEffectLabel).join(" · ")||"Resolver o efeito indicado pela carta";
 const selectEngineTarget=(id:string)=>{if(!engineDecision||!["targets","activation-targets"].includes(engineDecision.kind))return;const next=[...engineTargetSelection,id],required=(engineDecision.targetSteps||[]).filter((step:any)=>!step.optional).length||1;if(next.length<required){setEngineTargetSelection(next);return}setEngineTargetSelection([]);void runRulesCommand({type:"resolveDecision",targetIds:next},0)};
 const selectSacrificeTarget=(id:string)=>setEngineTargetSelection(current=>current.includes(id)?current.filter(value=>value!==id):current.length<(engineDecision?.kind==="sacrifice-and-fill"?(game?.players[0].board.length||0):(engineDecision?.effect.maximum||3))?[...current,id]:current);
 const confirmSacrifices=()=>{const ids=[...engineTargetSelection];setEngineTargetSelection([]);void runRulesCommand({type:"resolveDecision",targetIds:ids},0)};
 const cardSelectionDecision=!!engineDecision&&["search","zone-card","grave-resurrect","grave-to-hand-many","grave-to-hand-and-banish","hand-discard-one","hand-to-deck-bottom","hand-limit-discard","investigate-selection"].includes(engineDecision.kind);
 const decisionCards=cardSelectionDecision&&game?engineDecision.kind==="investigate-selection"?(engineDecision.effect.cards||[]):engineDecision.kind==="search"?game.players[0].deck.filter(card=>(!engineDecision.effect.types?.length||engineDecision.effect.types.includes(card.type))&&(!engineDecision.effect.subtype||hasFaction(card,engineDecision.effect.subtype as CardFaction))&&(!engineDecision.effect.vanillaOnly||!card.text.trim())&&(engineDecision.effect.minCost==null||card.cost>=engineDecision.effect.minCost)&&(engineDecision.effect.maxCost==null||card.cost<=engineDecision.effect.maxCost)&&(!engineDecision.effect.maxCostFromMarkerAmount||card.cost<=Number(engineDecision.context?.markerAmount||0))&&(!engineDecision.effect.nameIncludes||String(card.name||"").toLocaleLowerCase("pt-BR").includes(String(engineDecision.effect.nameIncludes).toLocaleLowerCase("pt-BR")))):["hand-discard-one","hand-to-deck-bottom","hand-limit-discard"].includes(engineDecision.kind)?game.players[0].hand:game.players[0].grave.filter(card=>(engineDecision.effect.choices||[]).includes((card as any).uid||card.id)):[];
 const variableGraveSelection=["grave-to-hand-many","grave-to-hand-and-banish"].includes(engineDecision?.kind||""),decisionCardMinimum=engineDecision?.kind==="investigate-selection"?0:variableGraveSelection?Math.min(engineDecision?.effect.minimum??0,decisionCards.length):engineDecision?.kind==="zone-card"||engineDecision?.kind==="grave-resurrect"?1:Math.min(engineDecision?.effect.amount||1,decisionCards.length),decisionCardMaximum=engineDecision?.kind==="investigate-selection"?decisionCards.length:variableGraveSelection?Math.min(engineDecision?.effect.maximum??decisionCards.length,decisionCards.length):decisionCardMinimum;
 const toggleDecisionCard=(id:string)=>setEngineTargetSelection(current=>current.includes(id)?current.filter(value=>value!==id):current.length<decisionCardMaximum?[...current,id]:current);
 const confirmDecisionCards=()=>{if(!engineDecision||engineTargetSelection.length<decisionCardMinimum||engineTargetSelection.length>decisionCardMaximum)return;const ids=[...engineTargetSelection];setEngineTargetSelection([]);void runRulesCommand(engineDecision.kind==="zone-card"||engineDecision.kind==="grave-resurrect"?{type:"resolveDecision",selectedCardId:ids[0]}:{type:"resolveDecision",selectedCardIds:ids},0)};
 const forcedAttackDecision=engineDecision?.kind==="forced-attack";
 const selectForcedAttack=(id:string)=>{if(!game)return;const next=[...engineTargetSelection,id];if(next.length<2){setEngineTargetSelection(next);return}setEngineTargetSelection([]);void runRulesCommand({type:"resolveDecision",attackerId:next[0],defenderId:next[1]},0)};
 const forcedAttackOwner=forcedAttackDecision?(engineDecision.owner??0):0,forcedAttackOpponent=forcedAttackOwner===0?1:0; const forcedAttackOptions=forcedAttackDecision&&game?(engineDecision.effect.attackerId?(engineTargetSelection.length===0?game.players[forcedAttackOwner].board.filter(card=>card.uid===engineDecision.effect.attackerId):game.players[forcedAttackOpponent].board.filter(card=>card.uid===engineDecision.effect.defenderId)):(engineTargetSelection.length===0?game.players[forcedAttackOwner].board.filter(card=>!card.exhausted&&!card.stunned&&hasFaction(card,"Dragão")):game.players[forcedAttackOpponent].board)):[];
 const zayanReplacementDecision=engineDecision?.kind==="zayan-destruction-replacement";
 const zayanReplacementOptions=zayanReplacementDecision&&game?game.players[0].board.filter(card=>(engineDecision.effect.choices||[]).includes(card.uid)):[];
 const resolveZayanReplacement=(targetId?:string)=>void runRulesCommand({type:"resolveDecision",choiceIndex:targetId?1:0,targetIds:targetId?[targetId]:[]},0);
 const markerPaymentDecision=engineDecision?.kind==="marker-payment-search";
 const markerPaymentOptions=markerPaymentDecision&&game?[...game.players[0].board,...game.players[0].support,...(game.players[0].terrain?[game.players[0].terrain]:[])].filter(card=>(engineDecision.effect.choices||[]).some((choice:any)=>choice.id===card.uid)):[];
 const selectMarkerPayment=(id:string)=>{const capacity=Number(engineDecision?.effect.choices?.find((choice:any)=>choice.id===id)?.markers||0);setEngineTargetSelection(current=>current.length>=Number(engineDecision?.effect.amount||5)||current.filter(value=>value===id).length>=capacity?current:[...current,id])};
 const confirmMarkerPayment=()=>{const counts=Object.entries(engineTargetSelection.reduce((result,id)=>({...result,[id]:(result[id]||0)+1}),{} as Record<string,number>)).map(([id,amount])=>({id,amount}));setEngineTargetSelection([]);void runRulesCommand({type:"resolveDecision",markerSelections:counts},0)};
 const mariaTieDecision=engineDecision?.kind==="maria-stat-tie";
 const mariaTieOptions=mariaTieDecision&&game?game.players[0].board.filter(card=>(engineDecision.effect.choices||[]).includes(card.uid)):[];
 const sacrificeAndFill=engineDecision?.kind==="sacrifice-and-fill";
 const drawPositionDecision=engineDecision?.kind==="draw-position";
 const redirectDecision=engineDecision?.kind==="redirect";
 const choiceTargetDecision=engineDecision?.kind==="choice-target";
 const choiceTargetOptions=choiceTargetDecision&&game?game.players.flatMap(player=>player.board):[];
 const resolveChoiceTarget=(id:string)=>{if(engineChoiceIndex==null)return;const choiceIndex=engineChoiceIndex;setEngineChoiceIndex(null);void runRulesCommand({type:"resolveDecision",choiceIndex,targetIds:[id]},0)};
 const decisionAmount=Math.max(0,Number(engineDecision?.effect?.amount||0));
 const plural=(amount:number,singular:string,pluralForm=`${singular}s`)=>amount===1?singular:pluralForm;
 const decisionCopy=(()=>{
  if(!engineDecision)return{eyebrow:"DECISÃO",title:"Escolha uma opção",instruction:"Escolha como o efeito deve ser resolvido."};
  const source=engineDecision.sourceName||"este efeito";
  switch(engineDecision.kind){
   case "hand-limit-discard":return{eyebrow:"LIMITE DE MÃO",title:`Descarte ${decisionAmount} ${plural(decisionAmount,"carta")}`,instruction:`Você encerrou o turno com mais de 9 cartas. Selecione exatamente ${decisionAmount} ${plural(decisionAmount,"carta")} da sua mão e confirme o descarte para ficar com 9 cartas.`};
   case "investigate-selection":return{eyebrow:`INVESTIGAR ${decisionAmount}`,title:"Escolha quais cartas revelar",instruction:"As selecionadas permanecerão reveladas no topo do deck, na ordem atual. As não selecionadas serão Arquivadas no fundo do deck."};
   case "search":return{eyebrow:"BUSCA NO DECK",title:`Escolha ${decisionCardMaximum} ${plural(decisionCardMaximum,"carta")}`,instruction:`Selecione ${decisionCardMinimum===decisionCardMaximum?"exatamente ":`de ${decisionCardMinimum} a `}${decisionCardMaximum} ${plural(decisionCardMaximum,"carta")} válida do seu deck para adicionar à sua mão.`};
   case "hand-discard-one":return{eyebrow:"DESCARTE",title:"Escolha uma carta para descartar",instruction:`Selecione a carta da sua mão que será descartada pelo efeito de ${source} e confirme.`};
   case "hand-to-deck-bottom":return{eyebrow:"FUNDO DO DECK",title:"Escolha uma carta da sua mão",instruction:`Selecione a carta que será colocada no fundo do seu deck pelo efeito de ${source} e confirme.`};
   case "zone-card":case "grave-resurrect":return{eyebrow:"CEMITÉRIO",title:"Escolha uma carta do cemitério",instruction:`Selecione a carta que será recuperada pelo efeito de ${source}.`};
   case "grave-to-hand-many":case "grave-to-hand-and-banish":return{eyebrow:"CEMITÉRIO",title:`Escolha de ${decisionCardMinimum} a ${decisionCardMaximum} cartas`,instruction:`Selecione as cartas do cemitério que serão afetadas por ${source} e confirme sua escolha.`};
   case "forced-attack":return{eyebrow:"ATAQUE OBRIGATÓRIO",title:engineTargetSelection.length?"":"",instruction:engineTargetSelection.length?"":""};
   case "zayan-destruction-replacement":return{eyebrow:"RESPOSTA DE ZAYAN II",title:"Uma criatura sem efeito será destruída",instruction:"Você pode destruir outra criatura no lugar dela. Escolha a substituta ou permita que a destruição original aconteça."};
   case "marker-payment-search":return{eyebrow:"PAGAMENTO DE MARCADORES",title:`Remova exatamente ${decisionAmount} marcadores`,instruction:"Clique nas suas constantes para distribuir a remoção. Você pode desfazer toda a seleção antes de confirmar; depois escolha um Feitiço ou Encanto do deck."};
   case "maria-stat-tie":return{eyebrow:"EMPATE DE OFENSIVIDADE",title:"Escolha quem Maria copiará",instruction:"Há mais de uma criatura aliada com a maior Ofensividade. Escolha de qual delas Maria copiará dinamicamente Ofensividade e Vitalidade."};
   case "sacrifice-and-fill":return{eyebrow:"SACRIFÍCIO",title:"Escolha quais criaturas sacrificar",instruction:"Selecione qualquer número de criaturas que deseja sacrificar e confirme. Os espaços liberados serão preenchidos conforme o efeito."};
   case "optional-sacrifice-buff":return{eyebrow:"SACRIFÍCIO OPCIONAL",title:"Escolha até 3 criaturas",instruction:"Selecione até 3 outras criaturas para sacrificar e fortalecer o Brutamontes, ou confirme sem selecionar nenhuma."};
   case "draw-position":return{eyebrow:"COMPRA DE CARTA",title:"Escolha de onde comprar",instruction:"Escolha se a próxima carta será comprada do topo ou do fundo do deck."};
   case "redirect":return{eyebrow:"REDIRECIONAMENTO",title:"Decida se deseja redirecionar",instruction:"Mantenha o alvo original ou selecione uma das suas cartas válidas para receber o efeito."};
   case "choice-target":return engineChoiceIndex==null?{eyebrow:"ESCOLHA DE EFEITO",title:"Escolha qual efeito aplicar",instruction:`Escolha uma das opções oferecidas por ${source}.`}:{eyebrow:"ESCOLHA DE ALVO",title:"Escolha uma criatura",instruction:`Selecione a criatura que receberá o efeito escolhido de ${source}.`};
   case "targets":case "activation-targets":return{eyebrow:engineDecision.kind==="activation-targets"?"EFEITO ATIVÁVEL":"ESCOLHA DE ALVO",title:`Escolha o alvo de ${source}`,instruction:`Selecione no campo ${engineTargetStep?.optional?"até um alvo válido":"um alvo válido"} para ${engineTargetConsequence.toLocaleLowerCase("pt-BR")}.`};
   case "repeat-choice":return{eyebrow:"EFEITO REPETIDO",title:"Escolha o próximo efeito",instruction:`Escolha qual efeito de ${source} será aplicado nesta repetição.`};
   case "replay-ability":return{eyebrow:"REPETIR HABILIDADE",title:"Escolha a habilidade que será repetida",instruction:"Selecione uma das habilidades disponíveis para aplicá-la novamente."};
   default:return{eyebrow:"RESOLVA O EFEITO", instruction:`Selecione uma das opções disponíveis para ${source}.`};
  }
 })();
 const repositionForLocal=!presentationBlocked&&!!game?.pendingReposition&&game.pendingReposition.activeOwner===0&&!game.pendingReposition.confirmed.includes(0);
 const moveForArteDaGuerra=(sourceId:string,slot:number)=>{if(!repositionForLocal||!game)return;void runRulesCommand({type:"reposition",moves:[{sourceId,slot}]},0)};
 const confirmArteDaGuerra=()=>{if(!repositionForLocal)return;void runRulesCommand({type:"confirmReposition"},0)};
 useEffect(()=>{const pending=game?.pendingReposition;if(!pending?.deadline){setRepositionSeconds(30);return}const tick=()=>setRepositionSeconds(Math.max(0,Math.ceil((pending.deadline-Date.now())/1000)));tick();const timer=window.setInterval(tick,250);return()=>window.clearInterval(timer)},[game?.pendingReposition?.deadline,game?.pendingReposition?.activeOwner]);
 useEffect(()=>{if(!repositionForLocal||repositionSeconds>0)return;confirmArteDaGuerra()},[repositionForLocal,repositionSeconds]);
 useEffect(()=>{const pending=game?.pendingReposition;if(mode!=="bot"||!game||pending?.activeOwner!==1||pending.confirmed.includes(1))return;const key=String(game.round)+":"+String(pending.deadline||0);if(aiRepositionHandledRef.current===key)return;aiRepositionHandledRef.current=key;const entry=game.players[1],isSupport=(card:Unit)=>!card.suffocated&&(/\bsuporte\b/i.test(card.text||"")||(card.tags||[]).some(tag=>/\bsuporte\b/i.test(String(tag)))),strength=(card:Unit)=>currentAtk(card,entry),moves:Array<{sourceId:string;slot:number}>=[],supportCreature=entry.board.find(isSupport);if(supportCreature){moves.push({sourceId:supportCreature.uid,slot:2});const others=entry.board.filter(card=>card.uid!==supportCreature.uid).sort((a,b)=>strength(b)-strength(a)),slots=[1,3,0,4];others.forEach((card,index)=>moves.push({sourceId:card.uid,slot:slots[index]??card.slot}))}else{const ordered=[...entry.board].sort((a,b)=>strength(b)-strength(a)),slots=[0,4,1,3,2];ordered.forEach((card,index)=>moves.push({sourceId:card.uid,slot:slots[index]??card.slot}))}const timer=window.setTimeout(()=>{void runRulesCommand({type:"reposition",moves},1).then(ok=>{if(ok)void runRulesCommand({type:"confirmReposition"},1)})},420);return()=>window.clearTimeout(timer)},[mode,game?.pendingReposition?.activeOwner,game?.pendingReposition?.deadline]);
 return <main className={`hh-app screen-${screen}`}>
  {decisionForLocal&&<div className={`engine-decision-backdrop ${engineTargetDecision?"engine-target-decision-backdrop":""}`}><section className={`engine-decision-panel ${engineTargetDecision?"engine-target-decision-panel":""}`} data-decision-kind={engineDecision.kind}>
    <small>{decisionCopy.eyebrow}</small>
    <h2>{decisionCopy.title}</h2>
    <p>{decisionCopy.instruction}</p>
    <div>
      {cardSelectionDecision?<><div className="visual-card-choice-grid">{decisionCards.map(card=>{const id=(card as any).uid||card.id;return <div className={`visual-card-choice ${engineTargetSelection.includes(id)?"selected":""}`} key={id}><OriginalCard card={card} small inspectable={false} selected={engineTargetSelection.includes(id)} onClick={()=>toggleDecisionCard(id)}/><span>{engineTargetSelection.includes(id)?"Selecionada":"Selecionar"}</span></div>})}</div><button className="gold" disabled={engineTargetSelection.length<decisionCardMinimum||engineTargetSelection.length>decisionCardMaximum} onClick={confirmDecisionCards}>Confirmar ({engineTargetSelection.length}/{decisionCardMaximum})</button></>:
      forcedAttackDecision?<div className="engine-target-instruction forced-attack-instruction"><b>{engineTargetSelection.length?"Escolha uma criatura inimiga":"Escolha um Dragão desvirado"}</b><em>Escolha diretamente uma das cartas destacadas no campo.</em></div>:
      zayanReplacementDecision?<><div className="visual-card-choice-grid">{zayanReplacementOptions.map(card=><div className="visual-card-choice" key={card.uid}><OriginalCard card={card} small inspectable={false} onClick={()=>resolveZayanReplacement(card.uid)}/><span>Destruir no lugar</span></div>)}</div><button onClick={()=>resolveZayanReplacement()}>Não substituir</button></>:
      markerPaymentDecision?<><div className="visual-card-choice-grid">{markerPaymentOptions.map(card=>{const selected=engineTargetSelection.filter(id=>id===card.uid).length;return <div className={`visual-card-choice ${selected?"selected":""}`} key={card.uid}><OriginalCard card={card} small inspectable={false} onClick={()=>selectMarkerPayment(card.uid)}/><span>{selected?`Remover ${selected}`:"Selecionar marcadores"}</span></div>})}</div><button onClick={()=>setEngineTargetSelection([])}>Desfazer</button><button className="gold" disabled={engineTargetSelection.length!==decisionAmount} onClick={confirmMarkerPayment}>Confirmar ({engineTargetSelection.length}/{decisionAmount})</button></>:
      mariaTieDecision?<div className="visual-card-choice-grid">{mariaTieOptions.map(card=><div className="visual-card-choice" key={card.uid}><OriginalCard card={card} small inspectable={false} onClick={()=>void runRulesCommand({type:"resolveDecision",targetIds:[card.uid]},0)}/><span>Copiar esta criatura</span></div>)}</div>:
      sacrificeAndFill?<><div className="visual-card-choice-grid">{(game?.players[0].board||[]).map(card=><div className={`visual-card-choice ${engineTargetSelection.includes(card.uid)?"selected":""}`} key={card.uid}><OriginalCard card={card} small inspectable={false} selected={engineTargetSelection.includes(card.uid)} onClick={()=>selectSacrificeTarget(card.uid)}/><span>{engineTargetSelection.includes(card.uid)?"Será sacrificada":"Manter em campo"}</span></div>)}</div><button className="gold" onClick={confirmSacrifices}>Confirmar ({engineTargetSelection.length})</button></>:
      drawPositionDecision?<><button onClick={()=>resolveEngineChoice(0)}><b>1</b><span>Topo do deck</span></button><button onClick={()=>resolveEngineChoice(1)}><b>2</b><span>Fundo do deck</span></button></>:
      redirectDecision?<><button onClick={()=>resolveEngineChoice(0)}><b>1</b><span>Não redirecionar</span></button><div className="visual-card-choice-grid">{game?.players[0]&&[...game.players[0].board,...game.players[0].support,...(game.players[0].terrain?[game.players[0].terrain]:[])].map(card=><div className="visual-card-choice" key={card.uid}><OriginalCard card={card} small inspectable={false} onClick={()=>void runRulesCommand({type:"resolveDecision",choiceIndex:1,targetIds:[card.uid]},0)}/><span>Redirecionar para esta carta</span></div>)}</div></>:
      choiceTargetDecision&&engineChoiceIndex!=null?<><div className="visual-card-choice-grid">{choiceTargetOptions.map(card=><div className="visual-card-choice" key={card.uid}><OriginalCard card={card} small inspectable={false} onClick={()=>resolveChoiceTarget(card.uid)}/><span>Escolher alvo</span></div>)}</div>{engineDecision.effect.optional&&<button onClick={()=>{setEngineChoiceIndex(null);void runRulesCommand({type:"resolveDecision"},0)}}>Não usar a Geomancia</button>}</>:
      sacrificeDecision?<><div className="visual-card-choice-grid">{(game?.players[0].board||[]).filter(card=>card.uid!==engineDecision.context?.sourceId).map(card=><div className={`visual-card-choice ${engineTargetSelection.includes(card.uid)?"selected":""}`} key={card.uid}><OriginalCard card={card} small inspectable={false} selected={engineTargetSelection.includes(card.uid)} onClick={()=>selectSacrificeTarget(card.uid)}/><span>{engineTargetSelection.includes(card.uid)?"Será sacrificada":"Selecionar"}</span></div>)}</div><button className="gold" onClick={confirmSacrifices}>Confirmar ({engineTargetSelection.length})</button></>:
      engineTargetDecision?<div className="engine-target-instruction"><b>{engineDecision.sourceName||"Efeito de carta"}</b><span>{engineTargetConsequence}</span><em>Escolha diretamente uma das cartas destacadas no campo.</em>{(engineDecision.targetSteps||[]).every(step=>step.optional)&&<button onClick={()=>void runRulesCommand({type:"resolveDecision",targetIds:[]},0)}>Não usar este efeito</button>}</div>:
      (engineDecision.effect.choices||[]).map((choice,index)=><button key={index} onClick={()=>choiceTargetDecision?setEngineChoiceIndex(index):resolveEngineChoice(index)}><b>{index+1}</b><span>{choice.map(decisionEffectLabel).join(" · ")||"Não usar"}</span></button>)}
    </div>
  </section></div>}
  {!!engineDecision&&!decisionForLocal&&<div className="engine-decision-wait">O oponente está escolhendo um efeito…</div>}
  {repositionForLocal&&<div className="arte-da-guerra-decision"><span><b>ARTE DA GUERRA</b> · Arraste suas criaturas entre os espaços</span><strong>{repositionSeconds}s</strong><button onClick={confirmArteDaGuerra}>CONFIRMAR POSIÇÕES</button></div>}
  {!!game?.pendingReposition&&!repositionForLocal&&<div className="engine-decision-wait">O oponente está reorganizando o campo com Arte da Guerra…</div>}
  {screen!=="game"&&<nav className="shell-nav"><button className="hh-logo hh-home-logo" type="button" onClick={()=>setScreen("menu")} aria-label="Voltar ao menu principal" title="Voltar ao menu"><Image src="/brand/hemsfell-heroes-mark-hq.png" alt="" width={512} height={512} aria-hidden="true"/></button><button onClick={()=>setScreen("tutorial")}>Tutorial <em>Aprenda a jogar</em></button><button onClick={()=>setScreen("decks")}>Coleção <em>{cards.length} cartas ativas</em></button></nav>}
  {screen==="menu"&&<section className="landing"><div className="landing-copy"><Image className="landing-brand-logo" src="/brand/hemsfell-heroes-logo-hq.png" alt="Hemsfell Heroes" width={1100} height={1020}/><div className="landing-actions">{sessionRecoveryPending?<button className="gold" disabled>Retomando partida…</button>:activeOnlineSession?<button className="gold" onClick={()=>void resumeOnlineSession(activeOnlineSession)}>Continuar partida</button>:<><button className="gold" onPointerEnter={()=>void loadAdvancedAIRuntime()} onFocus={()=>void loadAdvancedAIRuntime()} onClick={()=>{void loadAdvancedAIRuntime();setMode("bot");setScreen("setup")}}>Jogar contra IA</button><button className="online-cta" onClick={()=>{setMode("online");setScreen("setup")}}>Jogar online</button></>}<button onClick={()=>setScreen("tutorial")}>Tutorial</button><button onClick={()=>setScreen("decks")}>Coleção</button></div></div><div className="hero-fan">{deckDefs.slice(0,5).map((d,i)=><RemoteCardArt key={d.id} page={d.heroPage} name={d.name} priority style={{transform:`translateX(${(i-2)*50}px) rotate(${(i-2)*7}deg)`}}/>)}</div></section>}
  {screen==="tutorial"&&<TutorialScreen onBack={()=>setScreen("menu")}/>}
  {screen==="decks"&&<section className="collection">
   <header><button onClick={()=>setScreen("menu")}>← Menu</button><div><p>COLEÇÃO DE HERÓIS</p><h2>Todos os heróis</h2></div><span>11 decks · 298 cartas de jogo</span></header>
   <div className="deck-rail">{deckDefs.map(d=><button key={d.id} className={mine===d.id?"active":""} style={{"--deck":d.color} as React.CSSProperties} onClick={()=>setMine(d.id)}><RemoteCardArt page={d.heroPage} name={d.name}/><b>{d.name}</b><span>{d.style}</span></button>)}</div>
   <div className="deck-detail"><aside style={{"--deck":selectedDeck.color} as React.CSSProperties}>
    <button className="collection-hero-inspect" onClick={()=>setShowInspector(cards.find(card=>card.page===selectedDeck.heroPage)||null)} aria-label={`Ver detalhes de ${selectedDeck.name}`}><RemoteCardArt page={selectedDeck.heroPage} name={selectedDeck.name} priority/></button>
    <h3>{selectedDeck.name}</h3><p>{selectedDeck.faction} · {selectedDeck.style}</p><b>{mainDeckCopies} cartas no Deck Principal</b><strong className="extra-summary">Deck Extra · {selectedExtra.length} Imagens</strong>
    <span className={`deck-validity ${deckListValid?"is-valid":"is-invalid"}`}>{deckListValid?"✓ Lista válida":`⚠ ${deckValidation.errors.slice(0,3).map(deckValidationLabel).join(" · ")}`}</span>
    <button className="gold" disabled={!deckListValid} onClick={()=>setScreen("setup")}>Usar este deck</button>
   </aside><HeroGuide deck={selectedDeck}/><div className="collection-lists">
    <div className="collection-toolbar" role="search"><label className="collection-search-field"><span>Buscar cartas</span><input type="search" value={collectionQuery} onChange={event=>setCollectionQuery(event.target.value)} placeholder="Nome, efeito, palavra-chave…"/></label><label><span>Tipo</span><select value={collectionType} onChange={event=>setCollectionType(event.target.value as "Todas"|CardType)}><option>Todas</option>{(["Criatura","Feitiço","Artefato","Encanto","Terreno"] as CardType[]).map(type=><option key={type}>{type}</option>)}</select></label><output aria-live="polite">{filteredSelectedPool.length+filteredSelectedExtra.length} resultado(s)</output></div>
    <section><header><b>Deck Principal</b><span>{filteredSelectedPool.length} de {selectedPool.length} cartas únicas · {mainDeckCopies} cartas no total.</span></header>{filteredSelectedPool.length?<div className="card-library">{filteredSelectedPool.map(c=><OriginalCard key={c.id} card={c} small onClick={()=>setShowInspector(c)}/>)}</div>:<p className="collection-empty">Nenhuma carta do Deck Principal corresponde aos filtros.</p>}</section>
    <section className="extra-collection"><header><b>Deck Extra</b><span>{filteredSelectedExtra.length} de {selectedExtra.length} Imagens · invocadas apenas por efeitos</span></header>{filteredSelectedExtra.length?<div className="card-library">{filteredSelectedExtra.map(c=><OriginalCard key={c.id} card={c} small onClick={()=>setShowInspector(c)}/>)}</div>:<p className="collection-empty">{selectedExtra.length?"Nenhuma Imagem corresponde aos filtros.":"Este herói não possui cartas de Imagem no Deck Extra."}</p>}</section>
   </div></div>
  </section>}
    {screen==="setup"&&<section className="match-setup"><button className="back" onClick={()=>setScreen("menu")}>← Menu</button><div className="setup-head"><p>{mode==="online"?"SALA MULTIPLAYER":"PREPARE O TESTE"}</p><h2>{mode==="online"?"Crie ou entre em uma sala":"Selecione os dois decks"}</h2><span>{mode==="online"?"Compartilhe o link da sala; os dois jogadores escolhem seus decks antes de iniciar.":"As listas usam até três cópias e sempre totalizam 49 cartas."}</span></div>
        {mode!=="online"&&<>
            <div className="versus"><DeckPicker label="SEU DECK" value={mine} onChange={setMine}/><strong>VS</strong><DeckPicker label="OPONENTE" value={enemy} onChange={setEnemy}/></div>
            <div className="difficulty"><span>Inteligência da IA</span>{["Fácil","Normal","Difícil","Expert","Master"].map(x=><button key={x} className={difficulty===x?"active":""} onClick={()=>setDifficulty(x)}>{x}</button>)}</div>
            <button className="gold start" onClick={begin}>Iniciar partida de teste</button>
        </>}
        {mode==="online"&&<>
            {inviteRoomId&&!roomToken?<section className="invite-card">
              <div className="invite-sigil">⚔</div><p>CONVITE PARA BATALHA</p><h3>Você foi desafiado em Hemsfell</h3><span>Entre como convidado, escolha seu herói e prepare a mão inicial. Nenhuma conta é necessária.</span>
              {invitePreview&&<div className="invite-rules"><b>Regras da sala</b><span>♥ {invitePreview.settings?.startingLife} de vida</span><span>⏱ {invitePreview.settings?.turnSeconds}s por turno</span><span>↩ {invitePreview.settings?.responseSeconds}s para responder</span></div>}
              {roomError&&<em className="room-error">{roomError}</em>}
              <div><button onClick={()=>{history.replaceState({},"",location.pathname);setInviteRoomId(null);setScreen("menu")}}>Recusar</button><button className="gold" disabled={!invitePreview||joinPending} onClick={()=>void joinRoomWithPost(inviteRoomId)}>{joinPending?"Aceitando…":"Aceitar convite"}</button></div>
            </section>:<div className="room-panel">
                {!roomId&&<><div className="room-entry"><div><p>CRIAR BATALHA</p><h3>Configure sua sala privada</h3><span>O link abre um convite; o visitante só entra depois de aceitar.</span></div><div className="host-settings"><label>Vida inicial<input type="number" min="10" max="100" value={settings.startingLife} onChange={e=>setSettings({...settings,startingLife:Number(e.target.value)})}/></label><label>Resposta<select value={settings.responseSeconds} onChange={e=>setSettings({...settings,responseSeconds:Number(e.target.value)})}>{[15,30,45,60,90].map(n=><option key={n} value={n}>{n}s</option>)}</select></label><label>Turno<select value={settings.turnSeconds} onChange={e=>setSettings({...settings,turnSeconds:Number(e.target.value)})}>{[60,90,120,180,300].map(n=><option key={n} value={n}>{n}s</option>)}</select></label></div><button className="gold create-room" disabled={createRoomPending} onClick={()=>void createRoom()}>{createRoomPending?"Criando sala…":"Criar sala e gerar convite"}</button></div><div className="room-divider"><span>ou</span></div><div className="room-toolbar"><input placeholder="Cole o ID ou link da sala" id="join-room-input"/><button onClick={()=>{const v=(document.getElementById('join-room-input') as HTMLInputElement).value.trim();if(!v)return;const id=v.includes('room=')?new URL(v).searchParams.get('room')||v:v;setInviteRoomId(id);fetch(`/api/rooms/${id}`).then(r=>r.json()).then(setInvitePreview)}}>Ver convite</button></div></>}
                {roomId&&<><div className="lobby-head"><div><p>SALA {roomId.slice(-8).toUpperCase()}</p><h3>{roomInfo?.status==="waiting"?"Aguardando oponente":roomInfo?.status==="deck-selection"?"Escolha e confirme seu deck":roomInfo?.status==="coin-choice"?"A moeda decidiu":roomInfo?.status==="mulligan"?"Prepare sua mão inicial":"Partida em andamento"}</h3></div><span className={`connection ${roomInfo?.guest?"online":""}`}><i></i>{roomInfo?.guest?"2 jogadores conectados":"1 jogador conectado"}</span></div>
                {roomLink&&<div className="room-link"><div><b>Link do convite</b><span>Envie para o segundo jogador</span></div><input readOnly value={roomLink} onFocus={e=>e.currentTarget.select()}/><button onClick={()=>navigator.clipboard.writeText(roomLink)}>Copiar</button></div>}
                <div className="lobby-steps">{[["1","Convite",!!roomInfo?.guest],["2","Decks",!!roomInfo?.host?.deckLocked&&!!roomInfo?.guest?.deckLocked],["3","Moeda",!!roomInfo?.startingRole],["4","Mulligan",roomInfo?.status==="started"]].map(([n,label,done])=><div className={done?"done":roomInfo?.status==="started"?"done":""} key={String(n)}><i>{done?"✓":n}</i><span>{label}</span></div>)}</div>
                {roomInfo?.status==="deck-selection"&&<div className="room-deck-row"><DeckPicker label="SEU HERÓI E DECK" value={mine} onChange={setMine}/><button className="gold" disabled={!!myRoomParticipant?.deckLocked||lobbyActionPending} onClick={()=>void selectHeroInRoom(mine)}>{myRoomParticipant?.deckLocked?"Deck confirmado ✓":lobbyActionPending?"Confirmando…":"Confirmar este deck"}</button><aside><b>Oponente</b><span>{(isHost?roomInfo?.guest:roomInfo?.host)?.deckLocked?"Deck confirmado":"Escolhendo…"}</span></aside></div>}
                {roomInfo?.status==="coin-choice"&&<div className="coin-stage"><i className="coin">H</i><div><p>RESULTADO DA MOEDA</p><h3>{roomInfo.coinWinner===(isHost?"host":"guest")?"Você venceu o lançamento":"Seu oponente venceu o lançamento"}</h3>{roomInfo.coinWinner===(isHost?"host":"guest")?<div><button className="gold" disabled={lobbyActionPending} onClick={()=>void chooseStarter(true)}>{lobbyActionPending?"Iniciando…":"Eu começo"}</button><button disabled={lobbyActionPending} onClick={()=>void chooseStarter(false)}>Oponente começa</button></div>:<span>Aguardando o vencedor escolher quem inicia…</span>}</div></div>}
                {roomInfo?.status==="mulligan"&&<div className="lobby-wait"><i></i><b>Preparação da mão inicial</b><span>{roomInfo?.game?"Escolha suas trocas na tela de mulligan.":"Distribuindo as mãos…"}</span></div>}
                {roomError&&<em className="room-error">{roomError}</em>}</>}
            </div>}
        </>}
    </section>}
  {screen==="game"&&game&&me&&foe&&<div className="game-stage"><section className="hs-board game-content" data-card-dragging={dragging?"true":undefined}>
   <div className="game-bar"><button onClick={()=>setScreen("menu")}>☰</button><div className="turn-owner"><span>Turno {game.round}</span><b>{game.active===0?"Seu turno":`Turno de ${deckById(foe.heroId).name}`}</b></div><ResourceSummary me={me} foe={foe} active={game.active}/><div className="phase-track">{(["manutencao","principal","combate","fim"] as Phase[]).map((phase,i)=><div key={phase} className={`${game.phase===phase?"active":""} ${(["manutencao","principal","combate","fim"] as Phase[]).indexOf(game.phase)>i?"done":""}`}><i>{i+1}</i><span>{phaseNames[phase]}</span></div>)}</div>{mode==="online"&&<MatchTurnClock deadline={game.turnDeadline}/>}<button onClick={()=>setShowLog(!showLog)}>Registro {showLog?"×":"☷"}</button></div>
   {mode==="online"&&roomError&&<div className="online-command-error" role="alert">{roomError}</div>}
   {opponentReconnecting&&<div className="match-reconnect-overlay" role="status"><section><i>↻</i><b>Aguardando o outro jogador retornar</b><span>A partida e os relógios estão pausados por até 1 minuto.</span><strong><DeadlineText deadline={reconnectDeadline} clock/></strong></section></div>}
   {reconnectingSelf&&roomId&&roomToken&&<div className="match-reconnect-overlay" role="dialog" aria-modal="true"><section><i>↻</i><b>Você foi desconectado por inatividade</b><span>Retorne antes do fim do prazo para continuar a partida.</span><strong><DeadlineText deadline={myReconnectDeadline} clock/></strong><button className="gold" onClick={()=>void resumeOnlineSession({roomId,token:roomToken,isHost})}>Retornar à partida</button></section></div>}
   <div className="hero-panel-stack canonical-hero-panel enemy"><PlayerHero player={foe} enemy targetClass={engineTargetIds.includes("enemy-hero")?"target-enemy":enemyHeroTarget?"target-enemy":""} onTarget={engineTargetIds.includes("enemy-hero")?()=>selectEngineTarget("enemy-hero"):enemyHeroTarget?()=>applyTarget("enemy-hero"):undefined} onInspect={()=>setShowInspector(cards.find(card=>card.page===deckById(foe.heroId).heroPage)||null)}/><HeroAbilities player={foe} enemy/></div><div className="opponent-hand" style={{"--hand-count":Math.max(1,foe.hand.length)} as React.CSSProperties}>{foe.hand.map((card,i)=>card.revealed?<OriginalCard key={card.id} card={card} small onClick={()=>setShowInspector(card)}/>:<button type="button" className="opponent-card-back official-card-back" data-card-id={card.id} key={card.id||i} aria-label="Carta oculta do oponente"/>)}</div>
   <TerrainSlot card={foe.terrain} enemy targetClass={foe.terrain&&engineTargetIds.includes(foe.terrain.uid)?"target-enemy":enemyPermanentTarget?"target-enemy":""} onTarget={foe.terrain&&engineTargetIds.includes(foe.terrain.uid)?()=>selectEngineTarget(foe.terrain!.uid):enemyPermanentTarget&&foe.terrain?()=>applyTarget(foe.terrain!.uid):undefined}/><BattlefieldRows player={foe} enemy selectedAttacker={combatAction?.attackerOwner===1?combatAction.attackerUid:undefined} ruleTargetIds={forcedAttackDecision?forcedAttackOptions.map(card=>card.uid):engineTargetIds} onRuleTarget={forcedAttackDecision?selectForcedAttack:engineTargetDecision?selectEngineTarget:undefined} enemyTarget={enemyTarget} targetableCreatureIds={conditionalSpellTargetIds} supportTargetClass={enemyPermanentTarget?"target-enemy":""} onCreature={enemyTarget?applyTarget:undefined} onSupportTarget={enemyPermanentTarget?applyTarget:undefined} placementCreatureSlots={imagePlacementTargetOwner===1?imagePlacementCreatureSlots:undefined} placementSupportSlots={imagePlacementTargetOwner===1?imagePlacementSupportSlots:undefined} onPlacement={imagePlacementTargetOwner===1?chooseImagePlacement:undefined}/><EnergyPanel player={foe} enemy/><div className="side-piles enemy-piles"><MainDeckZone cards={foe.deck} shuffling={shufflingDeck===1} onInspect={setShowInspector}/><ExtraDeckZone cards={foe.extraDeck} onOpen={()=>setExtraView({title:`Deck Extra de ${deckById(foe.heroId).name}`,cards:foe.extraDeck})}/><PileZone title="CEMITÉRIO" kind="grave" cards={foe.grave} onOpen={()=>setExtraView({title:`Cemitério de ${heroDisplayName(foe.heroId)}`,cards:foe.grave})}/><PileZone title="OBSCURO" kind="obscuro" cards={foe.obscuro}/></div>
   <TerrainSlot card={me.terrain} targetClass={me.terrain&&engineTargetIds.includes(me.terrain.uid)?"target-ally":allyPermanentTarget?"target-ally":""} onTarget={me.terrain&&engineTargetIds.includes(me.terrain.uid)?()=>selectEngineTarget(me.terrain!.uid):allyPermanentTarget&&me.terrain?()=>applyTarget(me.terrain!.uid):undefined} drop={game.active===0&&game.phase==="principal"&&dragging?.type==="Terreno"} dragIndex={dragging?.index} onDrop={idx=>requestPlay(idx,"terrain")}/><BattlefieldRows player={me} repositionActive={repositionForLocal} onRepositionDrop={moveForArteDaGuerra} ruleTargetIds={forcedAttackDecision?forcedAttackOptions.map(card=>card.uid):engineTargetIds} onRuleTarget={forcedAttackDecision?selectForcedAttack:engineTargetDecision?selectEngineTarget:undefined} drop={game.active===0&&game.phase==="principal"} activationEnabled={game.active===0&&game.phase==="principal"&&!priorityLocked} combatActive={game.active===0&&game.phase==="combate"&&!priorityLocked} dragged={dragging} allyTarget={allyTarget||defenseChoice} targetableCreatureIds={localTargetableCreatureIds} supportTargetClass={allyPermanentTarget?"target-ally":""} selectedAttacker={combatAction?.attackerOwner===0?combatAction.attackerUid:undefined} onCreature={defenseChoice?chooseDefender:allyTarget?applyTarget:chooseAttacker} onCreatureDrop={(idx,slot)=>requestPlay(idx,"creature",slot)} onSupportDrop={(idx,slot)=>requestPlay(idx,"support",slot)} onActivateSupport={activateSupport} onActivateCreature={activateSupport} onSupportTarget={allyPermanentTarget?applyTarget:undefined} placementCreatureSlots={imagePlacementTargetOwner===0?imagePlacementCreatureSlots:undefined} placementSupportSlots={imagePlacementTargetOwner===0?imagePlacementSupportSlots:undefined} onPlacement={imagePlacementTargetOwner===0?chooseImagePlacement:undefined}/><EnergyPanel player={me}/><div className="side-piles player-piles"><MainDeckZone cards={me.deck} shuffling={shufflingDeck===0} onInspect={setShowInspector}/><ExtraDeckZone cards={me.extraDeck} onOpen={()=>setExtraView({title:"Seu Deck Extra",cards:me.extraDeck})}/><PileZone title="CEMITÉRIO" kind="grave" cards={me.grave} onOpen={()=>setExtraView({title:"Seu Cemitério",cards:me.grave})}/><PileZone title="OBSCURO" kind="obscuro" cards={me.obscuro}/></div><div className="hero-panel-stack canonical-hero-panel player"><PlayerHero player={me} onLevel={levelUp} canEvolveThisTurn={game.active===0&&!onlineCommandPending} targetClass={engineTargetIds.includes("ally-hero")?"target-ally":allyHeroTarget?"target-ally":""} onTarget={engineTargetIds.includes("ally-hero")?()=>selectEngineTarget("ally-hero"):allyHeroTarget?()=>applyTarget("ally-hero"):undefined} onInspect={()=>setShowInspector(cards.find(card=>card.page===deckById(me.heroId).heroPage)||null)}/><HeroAbilities player={me} onAbility={activateAbility} interactionEnabled={game.active===0&&!priorityLocked&&!combatAction&&!responseWindow&&!game.pendingDecision}/></div>
   <div className="player-hand" style={{"--hand-count":Math.max(1,me.hand.length)} as React.CSSProperties}>{me.hand.map((c,i)=><OriginalCard key={`${c.id}-${i}`} card={c} controller={me} priority activeEffect={activeCardEffect(c,me,0,responseWindow)} disabled={priorityLocked||game.active!==0||game.phase!=="principal"||!cardPlayRequirementMet(c,me,game,0)||effectiveCost(c,me)>playableResource(c,me)} draggable onDragStart={e=>{centerDragPreview(e);setDragging({index:i,type:c.type});e.dataTransfer.setData("card-index",String(i));e.dataTransfer.setData("text/plain",String(i));e.dataTransfer.effectAllowed="move"}} onDragEnd={()=>setDragging(null)} onClick={()=>setShowInspector(c)}/>)}</div>
   <div className="phase-orb">{game.active===0&&game.phase==="principal"&&<button disabled={priorityLocked} onClick={()=>{setTargeting(null);void runRulesCommand({type:"advancePhase"},0)}}>Combate<span>→</span></button>}{game.active===0&&game.phase==="combate"&&<button disabled={priorityLocked||!!combatAction||!!responseWindow||!!game.pendingReposition||!!mandatoryAttacker} onClick={finishCombat}>Encerrar combate<span>→</span></button>}{game.active===0&&game.phase==="fim"&&<button disabled={priorityLocked} onClick={()=>endTurn()}>Encerrar turno<span>→</span></button>}{game.active===0&&game.phase==="combate"&&mandatoryAttacker&&<small className="phase-orb-warning">⚠ {mandatoryAttacker.name} precisa atacar antes de encerrar o combate.</small>}</div>
   {imagePlacementDecision&&<div className="target-banner cafe-time-placement-banner"><div><b>POSICIONE O GATO MULTIDIMENSIONAL</b><span>Café do Tempo · escolha um espaço disponível no campo do jogador da vez</span></div></div>}
   {targeting&&<div className="target-banner"><div><b>{targeting.required&&targeting.required>1?`SELECIONE ALVOS · ${Math.min((targeting.selected?.length||0)+1,targeting.required)}/${targeting.required}`:"SELECIONE UM ALVO"}</b><span>{targeting.source}</span></div>{targeting.kind==="spell"&&(targeting.selected?.length||0)>=(targeting.minimum??targeting.required??1)&&(targeting.selected?.length||0)<(targeting.required||1)&&<button onClick={()=>{const ids=targeting.selected||[];playCard(targeting.cardIndex!,0,ids[0],undefined,undefined,!!targeting.response,targeting.fieldSlot,targeting.chosenElement,ids);setTargeting(null)}}>Confirmar {targeting.selected?.length} alvo</button>}{targeting.kind==="elemental-optional"&&<button onClick={()=>{playCard(targeting.cardIndex!,0,undefined,undefined,undefined,!!targeting.response,targeting.fieldSlot,targeting.chosenElement);setTargeting(null)}}>Jogar sem Congelar</button>}<button onClick={()=>setTargeting(null)}>Cancelar</button></div>}
   {combatAction && (
    <CombatAnimation
     action={combatAction}
     attackerHero={deckById(game.players[combatAction.attackerOwner].heroId).name}
     defenderHero={deckById(game.players[combatAction.attackerOwner === 0 ? 1 : 0].heroId).name}
    />
   )}
   {defenseChoice&&<div className="defense-decision"><span>ESCOLHA UMA CRIATURA PARA BLOQUEAR</span><b>OU</b><button onClick={chooseDirectDefense}>NÃO BLOQUEAR</button></div>}
   {visualFx&&<VisualEffect fx={visualFx} onComplete={()=>setVisualFx(current=>current?.id===visualFx.id?null:current)}/>} {shufflingDeck!==null&&<DeckShuffleEffect owner={shufflingDeck} onComplete={()=>setShufflingDeck(current=>current===shufflingDeck?null:current)}/>}<button className="surrender-button" onClick={()=>setConfirmSurrender(true)}>⚑ Render-se</button>
   <PriorityControlToggle mode={priorityControl.displayMode} queued={priorityControl.changeQueued} onToggle={priorityControl.toggle}/>
   {(game.pendingAction||game.priorityStack?.length)&&<div className="priority-stack-indicator" title="Ações aguardando resolução por prioridade"><span>PILHA</span><b>{Math.max(1,game.priorityStack?.length||0)}</b></div>}
   {priorityControl.showWindow&&visibleResponseWindow&&<ResponseModal action={visibleResponseWindow.action} available={localPriorityOptions} heroAbilities={localHeroPriorityOptions} budget={responseBudget(game,0)} offTurn={game.active!==0} deadline={visibleResponseWindow.deadline} passes={visibleResponseWindow.passes??0} cardName={card=>card.name} renderCard={(card,_index,onPlay)=><OriginalCard card={card} small inspectable={false} activeEffect="RESPOSTA ACELERADA" onClick={onPlay}/>} onPlay={chooseResponse} onHeroAbility={chooseHeroResponse} onPass={declineResponse}/>} {!presentationBlocked&&game.pendingResponse?.responder===1&&<div className="response-waiting"><i></i>{mode==="online"?<>Aguardando resposta do oponente <b><DeadlineText deadline={game.pendingResponse.deadline} suffix="s"/></b></>:"A IA está avaliando a prioridade…"}</div>}
   {showLog&&<aside className="test-log"><header><div><b>Registro do teste</b><span>{game.events} eventos</span></div><button onClick={()=>setShowLog(false)}>×</button></header><div className="metrics"><span><b>{game.round}</b>turnos</span><span><b>{me.damageDealt}</b>dano</span><span><b>{me.cardsPlayed}</b>cartas</span><span><b>{me.spellsPlayed}</b>feitiços</span></div><div className="events">{game.log.map(x=><p key={x.id} className={x.tone}><i></i>{x.text}</p>)}</div></aside>}
   {maintenanceOpen&&game.active===0&&game.winner===null&&<MaintenanceModal player={me} firstTurn={game.round===1} onChoose={doMaintenance}/>} 
   {mode==="online"&&roomInfo?.status==="mulligan"&&<MulliganModal player={me} count={myRoomParticipant?.mulliganCount??0} waiting={!!myRoomParticipant?.mulliganDone} pending={mulliganActionPending} deadline={myRoomParticipant?.mulliganDeadline} onDecision={confirmMulligan}/>}
   {elementChoice&&<div className="overlay image-choice-overlay"><section className="element-choice-dialog" role="dialog" aria-modal="true"><header><span>ORBE CROMÁTICO</span><button onClick={()=>setElementChoice(null)}>×</button></header><h2>Escolha o elemento do Orbe</h2><p>O elemento escolhido define a sinergia com a Cadeia Elemental antes do dano.</p><div>{(["Fogo","Água","Terra","Ar"] as ElementName[]).map(element=><button key={element} onClick={()=>{setTargeting({kind:"spell",source:elementChoice.name,cardIndex:elementChoice.cardIndex,required:1,minimum:1,selected:[],chosenElement:element});setElementChoice(null)}}>{element}</button>)}</div></section></div>}
   {imageChoice&&<ImageChoiceModal choice={imageChoice} extraDeck={me.extraDeck} onCancel={()=>setImageChoice(null)} onChoose={name=>{playCard(imageChoice.cardIndex,0,undefined,name,undefined,false,imageChoice.fieldSlot);setImageChoice(null)}}/>}
   {cafeChoice!==null&&<CafeChoiceModal onCancel={()=>setCafeChoice(null)} onChoose={effect=>{playCard(cafeChoice,0,undefined,undefined,effect);setCafeChoice(null)}}/>}
   {extraView&&<CardZoneModal kind={extraView.kind??(cleanName(extraView.title).includes("cemiterio")?"grave":"extra")} title={extraView.title} cards={extraView.cards} onClose={()=>setExtraView(null)}/>}
   {!presentationBlocked&&searchChoice&&<SearchDeckModal key={searchChoice.id} request={searchChoice} cards={game.players[searchChoice.owner].deck} onConfirm={completeSearch}/>}
   {confirmSurrender&&game.winner===null&&<div className="overlay surrender-overlay"><section className="surrender-dialog"><i>⚑</i><p>ENCERRAR PARTIDA</p><h2>Deseja realmente se render?</h2><span>A vitória será concedida imediatamente ao oponente.</span><div><button onClick={()=>setConfirmSurrender(false)}>Continuar jogando</button><button className="confirm-surrender" onClick={()=>{setConfirmSurrender(false);setCombatAction(null);setResponseWindow(null);if(mode==="online"){void runRulesCommand({type:"surrender"},0);return}update(g=>{g.winner=1;log(g,"Você se rendeu. A vitória foi concedida ao oponente.","danger")})}}>Confirmar rendição</button></div></section></div>}
   {game.winner!==null&&winnerDeck&&<MatchResultOverlay heroPage={winnerDeck.heroPage} heroName={winnerDisplayName} rounds={game.round} online={mode==="online"} rematchPending={rematchActionPending} rematchRequestedByMe={!!myRoomParticipant?.rematchRequested} rematchRequestedByOpponent={!!opponentRoomParticipant?.rematchRequested} onMenu={()=>{if(mode==="online")leaveOnlineMatch();else{setGame(null);currentGameRef.current=null;setScreen("menu")}}} onRematch={()=>{if(mode==="online")void requestOnlineRematch();else begin()}}/>}
  </section></div>}
 {showInspector&&<div className="overlay inspector card-focus-layer" onClick={()=>setShowInspector(null)} role="dialog" aria-modal="true" aria-label={`Detalhes de ${showInspector.name}`}><div onClick={event=>event.stopPropagation()}><button className="inspector-close" onClick={()=>setShowInspector(null)} aria-label="Fechar carta ampliada">×</button><RemoteCardArt page={showInspector.page} name={showInspector.name} priority/><aside>{deckByHeroPage(showInspector.page)?<div className="inspector-hero-guide"><HeroGuide deck={deckByHeroPage(showInspector.page)!}/><small>Carta {showInspector.page} · clique fora ou pressione o botão × para fechar</small></div>:<><p>{showInspector.imageCard?"IMAGEM · ":""}{showInspector.type} · custo {showInspector.cost}{showInspector.atk!=null?` · ${showInspector.atk}/${showInspector.hp}`:""}</p><h2>{showInspector.name}</h2>{showInspector.subtypes?.length?<section className="inspector-section"><b>SUBTIPOS</b><div className="inspector-subtypes">{showInspector.subtypes.map(subtype=><span key={subtype} title={`Esta carta pertence ao subtipo ${subtype}.`}>{subtype}</span>)}</div></section>:null}<section className="inspector-section"><b>EFEITO COMPLETO</b><RichCardText text={showInspector.text||"Esta carta não possui texto de efeito."}/></section><section className="inspector-section"><b>PALAVRAS-CHAVE</b><div className="inspector-keywords">{showInspector.tags.length?showInspector.tags.map(tag=><KeywordBadge name={tag} key={tag}/>):<span>Sem palavra-chave</span>}</div></section><small>Carta {showInspector.page} · clique fora ou pressione o botão × para fechar</small></>}</aside></div></div>}
 </main>
}


function useFiniteVisualCompletion(ref:{current:HTMLElement|null},identity:string,onComplete:()=>void){
 const completeRef=useRef(onComplete);useEffect(()=>{completeRef.current=onComplete},[onComplete]);
 useEffect(()=>{let cancelled=false,frame=0;const finish=()=>{if(!cancelled)completeRef.current()};frame=requestAnimationFrame(()=>{if(cancelled)return;const element=ref.current;if(!element){queueMicrotask(finish);return}const animations=element.getAnimations({subtree:true}).filter(animation=>{const timing=animation.effect?.getTiming();return timing?Number.isFinite(Number(timing.iterations)):false});if(!animations.length){queueMicrotask(finish);return}void Promise.allSettled(animations.map(animation=>animation.finished)).then(finish)});return()=>{cancelled=true;if(frame)cancelAnimationFrame(frame)}},[identity,ref]);
}

function VisualEffect({fx,onComplete}:{fx:VisualFx;onComplete:()=>void}){const ref=useRef<HTMLDivElement>(null);useFiniteVisualCompletion(ref,fx.id,onComplete);return <div ref={ref} className={`visual-effect fx-${fx.kind} fx-theme-${fx.theme} ${fx.target?"fx-targeted":""}`} aria-live="polite"><div className="fx-emblem" aria-hidden="true">{fx.theme==="blood"?"☾":fx.theme==="dragon"?"◆":fx.theme==="goblin"?"⚙":fx.theme==="recruit"?"⚔":fx.theme==="divine"?"✦":fx.theme==="nature"?"❧":fx.theme==="arcane"?"◈":fx.theme==="chaos"?"✹":fx.theme==="order"?"♜":"◇"}</div><div className="fx-runes">{Array.from({length:10},(_,i)=><i key={i}></i>)}</div>{fx.card?<RemoteCardArt page={fx.card.page} name={fx.card.name} priority/>:<span>✦</span>}{fx.target&&<><div className="effect-link"><i/><b>➜</b><i/></div><RemoteCardArt page={fx.target.page} name={fx.target.name} priority/></>}<section><b>{fx.label}</b><strong>{fx.detail}</strong>{fx.target&&<small>{fx.card?.name||"Efeito"} afeta {fx.target.name}</small>}</section></div>}

function DeckShuffleEffect({owner,onComplete}:{owner:0|1;onComplete:()=>void}){const ref=useRef<HTMLDivElement>(null);useFiniteVisualCompletion(ref,`shuffle-${owner}`,onComplete);return <div ref={ref} className={`deck-shuffle-effect owner-${owner}`} aria-live="polite"><div><i>H</i><i>H</i><i>H</i><i>H</i><i>H</i></div><b>EMBARALHANDO</b><span>{owner===0?"Seu Deck Principal":"Deck Principal adversário"}</span></div>}

function DeckPicker({label,value,onChange}:{label:string;value:DeckId;onChange:(v:DeckId)=>void}){const d=deckById(value);return <label className="deck-picker" style={{"--deck":d.color} as React.CSSProperties}><span>{label}</span><RemoteCardArt page={d.heroPage} name={d.name} priority/><select value={value} onChange={e=>onChange(e.target.value as DeckId)}>{deckDefs.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><b>{d.faction}</b><small>{d.style}</small></label>}
function HeroPortrait({heroId,page,name}:{heroId:DeckId;page:number;name:string}){
 const source=heroPortraitSources[heroId],[loaded,setLoaded]=useState(false);
 return <span className={`hero-portrait ${loaded?"is-loaded":""}`} style={{"--hero-portrait-position":source.position} as CSSProperties}>
  <Image src={source.src} alt="" aria-hidden="true" fill preload fetchPriority="high" sizes="(orientation: landscape) 16vw, 30vw" onLoad={()=>setLoaded(true)} onError={()=>setLoaded(false)}/>
  {!loaded&&<RemoteCardArt page={page} name={name} priority/>}
 </span>
}
function PlayerHero({player,enemy=false,onLevel,canEvolveThisTurn=true,targetClass="",onTarget,onInspect}:{player:Player;enemy?:boolean;onLevel?:()=>void;canEvolveThisTurn?:boolean;targetClass?:string;onTarget?:()=>void;onInspect?:()=>void}){
 const previousHeroLife=useRef(player.life),[heroHurt,setHeroHurt]=useState(false);
  useEffect(()=>{if(player.life<previousHeroLife.current){const presentationBusy=!!(window as Window&{__hemsfellPresentationBusy?:boolean}).__hemsfellPresentationBusy;previousHeroLife.current=player.life;if(presentationBusy){setHeroHurt(false);return}setHeroHurt(true);const timer=window.setTimeout(()=>setHeroHurt(false),620);return()=>window.clearTimeout(timer)}previousHeroLife.current=player.life},[player.life]);
 const d=deckById(player.heroId),targets=levelTargets(player),need=targets[player.level-1]??999,cost=player.level===1?2:3,unit=d.requirement.match(/\d+\/\d+\s*(.*)/)?.[1]||"marcos",progress=heroEvolutionProgress(player),progressReady=player.level<3&&progress>=need,canLevel=progressReady&&player.levelUpsThisTurn===0&&canEvolveThisTurn,canAfford=player.energy+player.reserve>=cost,clueCount=player.heroId==="ngoro"?Math.max(Number(player.heroXP||0),typeof player.markers==="number"?player.markers:Number(player.markers?.clue||0)):0;
 const heroCueItems:Array<{key:string,label:string,title:string,tone?:string}>=[];
 const authoritativeElementCues=player.nextElementEffects||[];
 if(authoritativeElementCues.length){const shownElementCues=new Set<string>();for(const effect of authoritativeElementCues){const cueKey=`element-${effect.element}-${effect.keyword}`;if(shownElementCues.has(cueKey))continue;shownElementCues.add(cueKey);heroCueItems.push({key:cueKey,label:`Próx. ${effect.element}: ${effect.keyword}`,title:`O próximo Feitiço de ${effect.element} aplica ${effect.keyword} adicional.`,tone:"element"})}}
 else if(player.elementChain)heroCueItems.push({key:`legacy-element-${player.elementChain.element}`,label:`Próx. ${player.elementChain.element}: ${player.elementChain.effect}`,title:`O próximo Feitiço de ${player.elementChain.element} aplica ${player.elementChain.effect} adicional.`,tone:"element"});
 const authoritativeDiscount=(player.nextCardDiscounts||[]).reduce((best,item)=>Math.max(best,Number(item.amount||0)),0),legacyDiscount=Math.max(Number(player.nextCardDiscount||0),Number(player.nextNonCreatureDiscount||0),Number(player.nextSpellDiscount||0)),discount=Math.max(authoritativeDiscount,legacyDiscount);
 if(discount>0)heroCueItems.push({key:"cost-discount",label:`Custo -${discount}`,title:`A próxima carta aplicável custa ${discount} a menos.`,tone:"cost"});
 if(player.nextCreaturePaysLife||player.nextSummonPaysLife)heroCueItems.push({key:"life-cost",label:"Próxima criatura: Vida",title:"Sua próxima criatura aplicável pode usar Vida em vez de Energia.",tone:"life"});
 if(player.noReserveStorageThisTurn)heroCueItems.push({key:"reserve-lock",label:"Reserva bloqueada",title:"Você não pode armazenar energia na Reserva neste turno.",tone:"warning"});
 return <div className={`player-hero ${enemy?"enemy":""} ${progressReady?"level-ready":""} ${heroHurt?"hero-hurt":""} ${targetClass}`} style={{"--deck":d.color} as React.CSSProperties} onClick={onTarget} role={onTarget?"button":undefined}>
  {/* Only this trigger opens the power tooltip. Keeping evolution outside it prevents both tooltips from opening together. */}
  <div className="hero-power-trigger" data-hero-role={enemy?"enemy":"ally"} tabIndex={0} role="button" aria-label={`Ver detalhes de ${heroDisplayName(player.heroId)}`} onClick={event=>{if(!onTarget){event.stopPropagation();onInspect?.()}}}>
   <span className="hero-short-name">{player.heroId==="goblin"?"Sr. Goblin":heroDisplayName(player.heroId)}</span>
    <HeroPortrait heroId={player.heroId as DeckId} page={d.heroPage} name={d.name}/>
   {player.heroId==="ngoro"&&<span className="hero-clue-counter" title="Pistas" aria-label={`${clueCount} Pistas`}><i aria-hidden="true">⌕</i><b>{clueCount}</b></span>}
   <strong className="hero-life"><span aria-hidden="true">♥</span><b>{player.life}</b></strong>
  </div>
  <div className="hero-level-row">
   <span className="hero-level">NÍVEL {player.level}</span>
   <div className="hero-evolution" tabIndex={0} aria-label={`Critérios de evolução de ${heroDisplayName(player.heroId)}`}>
    <span className="hero-evolution-copy"><small>{player.level>=3?"EVOLUÇÃO CONCLUÍDA":"PRÓX. NÍVEL"}</small><strong>{player.level>=3?"3/3":`${progress}/${need}`}</strong></span>
    <div className="evolution-track"><i style={{width:`${Math.min(100,player.level>=3?100:(progress/Math.max(1,need))*100)}%`}}/></div>
    <div className="evolution-tooltip" role="tooltip"><p>{evolutionCriterionSummary(player.heroId)}</p><b>➜</b><div><span>{targets[0]} {unit} → Nível 2</span><span>{targets[1]} {unit} → Nível 3</span></div></div>
   </div>
  </div>
  {heroCueItems.length>0&&<div className={`hero-status-cues ${enemy?"enemy-cues":"local has-cues"}`} data-hero-status-cues={enemy?"enemy":"local"} aria-label={`Efeitos ativos de ${heroDisplayName(player.heroId)}`}>{heroCueItems.map((cue,index)=><span key={`${cue.key}-${index}`} className={cue.tone?`cue-${cue.tone}`:undefined} title={cue.title}>{cue.label}</span>)}</div>}
  {!enemy&&player.level<3&&<button className="level-button" disabled={!canLevel||!canAfford} title={!canEvolveThisTurn?"Só é possível evoluir durante o seu turno.":!progressReady?"Complete o critério de evolução.":player.levelUpsThisTurn>0?"Você já evoluiu neste turno.":canAfford?"Evoluir agora":"Energia insuficiente para evoluir"} onClick={e=>{e.stopPropagation();onLevel?.()}}>EVOLUIR · {cost} ✦</button>}
 </div>
}

function HeroAbilities({player,enemy=false,onAbility,interactionEnabled=true}:{player:Player;enemy?:boolean;onAbility?:(slot:number)=>void;interactionEnabled?:boolean}){
 const d=deckById(player.heroId);
 return <aside className={`hero-abilities hero-command-bar ${enemy?"enemy":""}`} style={{"--deck":d.color} as React.CSSProperties} aria-label={`Habilidades de ${heroDisplayName(player.heroId)}`}>
  {d.abilities.map((ability,slot)=>{
   const active=isActiveAbility(d.id,slot),key=`${d.id}-${slot}`,unlockLevel=Math.min(3,slot+1),locked=player.level<unlockLevel,used=!!player.abilityUses[key],clueCount=Math.max(Number(player.heroXP||0),Number((player.markers as any)?.clue||0)),clueCost=d.id==="ngoro"?(slot===1?2:slot===2?3:0):0;
   const noResource=d.id==="saymon"&&(slot===0||slot===1)?player.life<=2:clueCost>0?clueCount<clueCost:false;
   const noValidTarget=d.id==="gimble"&&slot===1?!player.board.some(card=>hasFaction(card,"Dragão")&&card.exhausted):d.id==="ngoro"&&slot===2?!player.board.length:false;
   const unavailable=enemy||locked||used||noResource||noValidTarget||!interactionEnabled;
   const clickable=active&&!unavailable;
   const stateClass=locked?"is-locked":active?(clickable?"is-active is-available":"is-active is-unavailable"):"is-passive";
   const action=d.id==="saymon"?"Pagar 2 de vida":clueCost?`Gastar ${clueCost} Pistas`:"Ativar";
   const title=locked?`Habilidade liberada no nível ${slot+1}.`:active?(used?"Habilidade já usada neste turno.":noResource?"Recursos insuficientes.":noValidTarget?"Não há alvo válido.":!interactionEnabled?"Aguarde a ação atual terminar.":`${action}: ${ability}`):"Habilidade passiva; resolve automaticamente.";
   const abilityCopy=ability.replace(/^[IVX]+ · /,"");
   const abilityDetail=locked
    ? `Desbloqueada quando o Herói alcançar o nível ${unlockLevel}.`
    : active
      ? `${action}. Depois de ativada, esta habilidade segue as condições e os alvos descritos acima.`
      : "Efeito passivo: resolve automaticamente sempre que a condição descrita for atendida.";
   const abilityTooltip=`${active?"ATIVA":"PASSIVA"} · NÍVEL ${unlockLevel}\n${abilityCopy}\n\n${abilityDetail}`;
   const copyDensity=abilityCopy.length>110?"copy-dense":abilityCopy.length>72?"copy-compact":"copy-normal";
   return <button type="button" className={`ability hero-ability-chip ${stateClass} ${locked?"":"is-unlocked"} ${copyDensity}`} key={ability} aria-disabled={!clickable} tabIndex={0} onClick={event=>{event.preventDefault();event.stopPropagation();if(clickable)onAbility?.(slot)}} data-ability-tooltip={abilityTooltip} data-ability-state={title} aria-label={`${active?"Ativa":"Passiva"}: ${ability}`}><i className="hero-ability-slot" aria-hidden="true">{slot+1}</i><span className="hero-ability-copy"><b>{active?"ATIVA":"PASSIVA"}</b><p>{abilityCopy}</p></span></button>
  })}
 </aside>
}

function ResourceSummary({me,foe,active}:{me:Player;foe:Player;active:0|1}){
 return <div className="resource-summary">
  <div className={`resource-panel ${active===0?"active-player":""}`}>
   <span>Você</span>
   <strong>✦ {me.energy}/{me.maxEnergy}</strong>
   <small>Reserva {me.reserve}/3</small>
  </div>
  <div className={`resource-panel ${active===1?"active-player":""}`}>
   <span>Oponente</span>
   <strong>✦ {foe.energy}/{foe.maxEnergy}</strong>
   <small>Reserva {foe.reserve}/3</small>
  </div>
 </div>}

function EnergyPanel({player,enemy=false}:{player:Player;enemy?:boolean}){
 return <aside className={`field-energy ${enemy?"enemy-energy":"player-energy"}`} aria-label={`${player.energy} de ${player.maxEnergy} energias; ${player.reserve} de 3 reservas`}>
  <div className="energy-dial"><b>ENERGIA</b><span className="energy-ring">{Array.from({length:10},(_,index)=><i key={index} className={`${index<player.energy?"filled":""} ${index>=player.maxEnergy?"locked":""}`}/>)}</span><strong><em>{player.energy}</em><small>/{player.maxEnergy}</small></strong></div>
  <div className="reserve-track"><b>RESERVA</b><span>{Array.from({length:3},(_,index)=><i key={index} className={index<player.reserve?"filled":""}/>)}</span><strong>{player.reserve}/3</strong></div>
 </aside>
}

function SlotTypeIcon({kind}:{kind:"terrain"|"creature"|"auxiliary"}){
 return <svg className={`slot-type-icon ${kind}-type-icon`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  {kind==="terrain"&&<><path d="M2.5 20.5 8.7 8.1l3.1 4.4L15.2 4l6.3 16.5h-19Z"/><path className="slot-icon-cut" d="m7 18 2-4 2.9 4.1 3-7.3 2.8 7.2H7Z"/></>}
  {kind==="auxiliary"&&<path d="M13.7 2.1c.8 4.3-2.9 6-1.9 9.1.9-1.5 2.2-2.5 3.8-3.1-.1 3.2 3.3 4.6 2.5 8.5-.7 3.3-3.4 5.4-6.8 5.4C7.2 22 4 19 4 15.2c0-3.2 1.8-5.7 4.7-7.6-.4 2.4.4 3.9 2 5-.4-4.8 2.4-7.6 3-10.5Z"/>}
  {kind==="creature"&&<><path d="M12 2.3a9 9 0 0 0-9 9V18h3v4h3v-4h6v4h3v-4h3v-6.7a9 9 0 0 0-9-9Z"/><path className="slot-icon-cut" d="M10.7 5.7V15H6v-3.7a6 6 0 0 1 4.7-5.6Zm2.6 0a6 6 0 0 1 4.7 5.6V15h-4.7V5.7Z"/></>}
 </svg>
}

function TerrainSlot({card,enemy=false,drop=false,dragIndex,onDrop,targetClass="",onTarget}:{card:Unit|null;enemy?:boolean;drop?:boolean;dragIndex?:number;onDrop?:(i:number)=>void;targetClass?:string;onTarget?:()=>void}){
 return <div className={`terrain-slot ${enemy?"enemy-terrain":"player-terrain"} ${drop?"can-drop":""}`} aria-label={card?undefined:"Espaço de terreno cruel"} onDragOver={e=>{if(drop){e.preventDefault();e.dataTransfer.dropEffect="move"}}} onDrop={e=>{e.preventDefault();if(drop)onDrop?.(dragIndex??Number(e.dataTransfer.getData("card-index")||e.dataTransfer.getData("text/plain")))}}>
  {card?<OriginalCard card={card} small priority targetClass={targetClass} onClick={onTarget}/>:<SlotTypeIcon kind="terrain"/>}
 </div>
}

function BattlefieldRows({player,enemy=false,drop=false,dragged,allyTarget=false,enemyTarget=false,targetableCreatureIds,ruleTargetIds,supportTargetClass="",selectedAttacker,onCreature,onRuleTarget,onCreatureDrop,onSupportDrop,onActivateSupport,onActivateCreature,onSupportTarget,placementCreatureSlots,placementSupportSlots,onPlacement,activationEnabled=false,combatActive=false,repositionActive=false,onRepositionDrop}:{player:Player;enemy?:boolean;drop?:boolean;dragged?:{index:number;type:CardType}|null;allyTarget?:boolean;enemyTarget?:boolean;targetableCreatureIds?:string[];ruleTargetIds?:string[];supportTargetClass?:string;selectedAttacker?:string;onCreature?:(uid:string)=>void;onRuleTarget?:(uid:string)=>void;onCreatureDrop?:(idx:number,slot:number)=>void;onSupportDrop?:(idx:number,slot:number)=>void;onActivateSupport?:(uid:string)=>void;onActivateCreature?:(uid:string)=>void;onSupportTarget?:(uid:string)=>void;placementCreatureSlots?:number[];placementSupportSlots?:number[];onPlacement?:(slot:number,zone:"creature"|"support")=>void;activationEnabled?:boolean;combatActive?:boolean;repositionActive?:boolean;onRepositionDrop?:(uid:string,slot:number)=>void}){
 return <div className={`paired-field ${enemy?"enemy-field":"player-field"} ${repositionActive?"arte-reposition-active":""}`}>
  {Array.from({length:5},(_,slot)=>{const creature=player.board.find(unit=>unit.slot===slot),support=player.support.find(unit=>unit.slot===slot),linked=!!creature&&support?.attachedTo===creature.uid,canCreature=repositionActive||(drop&&dragged?.type==="Criatura"),isAuxiliaryCard=!!dragged&&!["Criatura","Terreno","Herói"].includes(dragged.type),catSupport=!!dragged&&dragged.type==="Criatura"&&player.heroId==="rasmus"&&player.level>=3&&hasFaction(player.hand[dragged.index],"Gato"),canSupport=!repositionActive&&drop&&!support&&(isAuxiliaryCard||catSupport)&&(dragged!.type!=="Artefato"||!!creature),placementCreature=!!placementCreatureSlots?.includes(slot),placementSupport=!!placementSupportSlots?.includes(slot),creatureRuleTarget=!!creature&&!!ruleTargetIds?.includes(creature.uid),supportRuleTarget=!!support&&!!ruleTargetIds?.includes(support.uid),canAttackNow=!!creature&&combatActive&&!enemy&&!creature.exhausted&&(creature.attacksThisTurn??(creature.attackedThisTurn?1:0))<(creature.attackLimit||1)&&!creature.summoning&&!creature.stunned&&!creature.immobilized;return <div className={`field-column ${linked?"linked-pair":""}`} key={slot}>
   <div className={`field-slot creature-slot ${player.heroId==="tessalia"&&slot===2?"commander-slot":""} ${canCreature?`can-drop exact-drop ${creature?"replace-drop":""}`:""} ${placementCreature?"placement-target":""}`} data-slot={slot+1} aria-label={`Espaço de criatura ${slot+1}`} onClick={()=>{if(placementCreature)onPlacement?.(slot,"creature")}} onDragEnter={e=>{if(canCreature)e.currentTarget.classList.add("drag-over")}} onDragLeave={e=>e.currentTarget.classList.remove("drag-over")} onDragOver={e=>{if(canCreature){e.preventDefault();e.dataTransfer.dropEffect="move"}}} onDrop={e=>{e.preventDefault();e.currentTarget.classList.remove("drag-over");if(repositionActive){const uid=e.dataTransfer.getData("reposition-source");if(uid)onRepositionDrop?.(uid,slot)}else if(canCreature)onCreatureDrop?.(dragged!.index,slot)}}>{creature?<OriginalCard card={creature} controller={player} small priority selected={selectedAttacker===creature.uid} activeEffect={activeUnitEffect(player,creature)} targetClass={`${creatureRuleTarget?(enemy?"target-enemy":"target-ally"):allyTarget&&(!targetableCreatureIds||targetableCreatureIds.includes(creature.uid))?"target-ally":enemyTarget&&(!targetableCreatureIds||targetableCreatureIds.includes(creature.uid))?"target-enemy":""} ${canAttackNow?"combat-attack-ready":""}`.trim()} draggable={repositionActive&&!enemy} onDragStart={repositionActive&&!enemy?e=>{centerDragPreview(e);e.dataTransfer.setData("reposition-source",creature.uid);e.dataTransfer.effectAllowed="move"}:undefined} onClick={repositionActive?undefined:creatureRuleTarget&&onRuleTarget?()=>onRuleTarget(creature.uid):onCreature&&(!targetableCreatureIds||targetableCreatureIds.includes(creature.uid))?()=>onCreature(creature.uid):undefined} onActivate={repositionActive?undefined:onActivateCreature?()=>onActivateCreature(creature.uid):undefined} activationDisabled={repositionActive||!activationEnabled||!canActivateUnit(player,creature)}/>:<span className="slot-type-icon creature-type-icon" aria-hidden="true">♞</span>}</div>
   <div className={`field-slot auxiliary-slot ${canSupport?"can-drop exact-drop":""} ${placementSupport?"placement-target":""}`} data-slot={slot+1} aria-label={`Espaço de carta auxiliar ${slot+1}`} onClick={()=>{if(placementSupport)onPlacement?.(slot,"support")}} onDragEnter={e=>{if(canSupport)e.currentTarget.classList.add("drag-over")}} onDragLeave={e=>e.currentTarget.classList.remove("drag-over")} onDragOver={e=>{if(canSupport){e.preventDefault();e.dataTransfer.dropEffect="move"}}} onDrop={e=>{e.preventDefault();e.currentTarget.classList.remove("drag-over");if(canSupport)onSupportDrop?.(dragged!.index,slot)}}>{support?<div className="support-card"><OriginalCard card={support} controller={player} small priority activeEffect={support.suffocated?"":"EFEITO ATIVO"} targetClass={supportRuleTarget?(enemy?"target-enemy":"target-ally"):supportTargetClass} onClick={repositionActive?undefined:supportRuleTarget&&onRuleTarget?()=>onRuleTarget(support.uid):onSupportTarget?()=>onSupportTarget(support.uid):undefined} onActivate={repositionActive?undefined:onActivateSupport?()=>onActivateSupport(support.uid):undefined} activationDisabled={repositionActive||!activationEnabled||!canActivateUnit(player,support)}/>{support.markers>0&&<b className="marker-count">{support.markers}</b>}</div>:<span className="slot-type-icon auxiliary-type-icon" aria-hidden="true">✦</span>}</div>
  </div>})}
 </div>
}

function MainDeckZone({cards,shuffling=false,onInspect}:{cards:CardDef[];shuffling?:boolean;onInspect:(card:CardDef)=>void}){
 const revealedTop:CardDef[]=[];for(const card of cards){if(!card.revealed)break;revealedTop.push(card)}const top=revealedTop[0];
 return <div className={`pile-zone main-deck ${shuffling?"is-shuffling":""} ${top?"has-revealed-top":""}`} aria-label={`Deck Principal: ${cards.length} cartas${revealedTop.length?`; ${revealedTop.length} revelada(s) no topo`:""}`}>
  {top?<span className="revealed-deck-stack">{revealedTop.map((card,index)=><button type="button" className="pile-card revealed-deck-card" style={{"--revealed-index":20-index,"--revealed-x":`${index*.2}cqw`,"--revealed-y":`${index*-.18}cqh`} as React.CSSProperties} key={(card as any).uid||card.id} onClick={()=>onInspect(card)} aria-label={`Ver ${card.name}, revelada no topo do deck`}><RemoteCardArt page={card.page} name={card.name}/><span className="revealed-badge" title="Revelada no topo">◉</span></button>)}</span>:<span className="pile-card official-card-back"><i/><i/><i/></span>}<b>Deck</b><strong>{cards.length}</strong><small>{revealedTop.length?`${revealedTop.length} revelada(s) no topo`:"conteúdo oculto"}</small>
 </div>
}

function ExtraDeckZone({cards,onOpen}:{cards:CardDef[];onOpen:()=>void}){
 return <button className="pile-zone extra-deck" onClick={onOpen} aria-label={`Deck Extra: ${cards.length} Imagens`}><span className="pile-card"><i>✦</i></span><b>Deck Extra</b><strong>{cards.length}</strong><small>Imagens disponíveis</small></button>
}

function PileZone({title,kind,cards,onOpen}:{title:string;kind:"grave"|"obscuro";cards:CardDef[];onOpen?:()=>void}){
 const top=cards.at(-1);
 return <button className={`pile-zone ${kind}`} disabled={!top||!onOpen} onClick={onOpen} aria-label={`${title}: ${cards.length} cartas${top?"; abrir lista":""}`}>
  <span className="pile-card">{top&&kind==="grave"?<RemoteCardArt page={top.page} name={top.name}/>:<i>{kind==="grave"?"♰":"◈"}</i>}</span><b>{title}</b><strong>{cards.length}</strong><small>{kind==="grave"?"cartas destruídas":"fora do jogo"}</small>
 </button>
}

function MaintenanceModal({player,firstTurn,onChoose}:{player:Player;firstTurn:boolean;onChoose:(two:boolean)=>void}){
 return <div className="overlay maintenance-overlay"><section className="maintenance maintenance-dialog" role="dialog" aria-modal="true" aria-labelledby="maintenance-title">
  <header><span>ETAPA 1 DE 4</span><b>MANUTENÇÃO</b></header><h2 id="maintenance-title">Prepare seu próximo turno</h2><p>Suas criaturas recuperaram a vitalidade e foram desviradas. Agora escolha um dos recursos abaixo.</p>
  <div className="maintenance-status"><span>Energia máxima atual <b>{player.maxEnergy}</b></span><span>Cartas na mão <b>{player.hand.length}</b></span></div>
  <div className="maintenance-options"><button className="maintenance-choice primary-choice" onClick={()=>onChoose(false)}><i>✦</i><strong>Expandir energia</strong><b>+1 Energia Máxima</b><small>Depois, compre 1 carta e recarregue sua energia.</small></button><button className="maintenance-choice" disabled={firstTurn} onClick={()=>onChoose(true)}><i>▰</i><strong>Reforçar a mão</strong><b>Compre 2 Cartas</b><small>Mantenha sua energia máxima atual e recarregue-a.</small>{firstTurn&&<em>Bloqueado no primeiro turno</em>}</button></div>
  <footer>Após a escolha, a partida avança automaticamente para a etapa Principal.</footer>
 </section></div>
}

function ImageChoiceModal({choice,extraDeck,onChoose,onCancel}:{choice:ImageChoice;extraDeck:CardDef[];onChoose:(name:string)=>void;onCancel:()=>void}){
 return <div className="overlay image-choice-overlay"><section className="image-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="image-choice-title"><header><span>EFEITO DE {choice.cardName}</span><button onClick={onCancel}>×</button></header><h2 id="image-choice-title">Escolha uma Imagem</h2><p>A carta escolhida será invocada diretamente do seu Deck Extra para a zona correspondente ao tipo dela.</p><div>{choice.options.map(name=>{const card=extraDeck.find(x=>cleanName(x.name)===cleanName(name));return <button key={name} disabled={!card} onClick={()=>onChoose(name)}>{card?<RemoteCardArt page={card.page} name={card.name}/>:<span>Imagem indisponível</span>}<b>{name}</b><small>{card?`${card.type} · Deck Extra`:"Já está em campo ou fora do Deck Extra"}</small></button>})}</div></section></div>
}

function CafeChoiceModal({onChoose,onCancel}:{onChoose:(effect:CafeChoice)=>void;onCancel:()=>void}){
 const options:[CafeChoice,string,string,string][]=[["cats","Invocar três Gatos","Cria três Imagens de Gato Multidimensional. O seu campo é preenchido primeiro e, sem espaço, o campo rival.","♜"],["heal","Restaurar o herói","Cure 10 de vida, sem ultrapassar o máximo de 30.","♥"],["draw","Repor a mão","Compre 3 cartas do Deck Principal.","▰"],["level","Subir de nível","Aumente o nível do herói em 1, até o limite de 3.","✦"]];
 return <div className="overlay image-choice-overlay"><section className="cafe-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="cafe-choice-title"><header><span>EFEITO DE CAFÉ ESPECIAL</span><button onClick={onCancel}>×</button></header><h2 id="cafe-choice-title">Escolha apenas um efeito</h2><p>A Imagem Café Especial volta ao Deck Extra após a resolução.</p><div>{options.map(([value,title,detail,icon])=><button key={value} onClick={()=>onChoose(value)}><i>{icon}</i><b>{title}</b><small>{detail}</small></button>)}</div></section></div>
}

function CardZoneModal({kind,title,cards,onClose}:{kind:"extra"|"grave";title:string;cards:CardDef[];onClose:()=>void}){
 const grave=kind==="grave",displayCards=grave?cards.map(baseCard):cards;
 return <div className={`overlay extra-deck-overlay ${grave?"graveyard-overlay":""}`}><section className="extra-deck-dialog" role="dialog" aria-modal="true" aria-labelledby="extra-title"><header><div><span>{grave?"CARTAS NO CEMITÉRIO":"IMAGENS DISPONÍVEIS"}</span><h2 id="extra-title">{title}</h2></div><button onClick={onClose}>×</button></header>{displayCards.length?<div className="extra-card-grid">{displayCards.map((card,index)=><OriginalCard key={`${card.id}-${index}`} card={card} small inspectable/>)}</div>:<p>{grave?"Este Cemitério está vazio.":"Todas as Imagens deste Deck Extra estão atualmente em campo, na mão ou resolvendo seus efeitos."}</p>}<footer>{grave?"As cartas são mostradas em seu estado impresso, sem atributos, marcadores ou ícones temporários do campo.":"Imagens não são compradas pelo Deck Principal. Elas entram em jogo somente quando um efeito as cria ou invoca."}</footer></section></div>
}

function SearchDeckModal({request,cards,onConfirm}:{request:SearchRequest;cards:CardDef[];onConfirm:(ids:string[])=>void}){
 const [selected,setSelected]=useState<string[]>([]),valid=useMemo(()=>cards.filter(card=>matchesSearch(card,request)),[cards,request]),selectedIds=useMemo(()=>new Set(selected),[selected]),required=Math.min(request.limit,valid.length),ready=request.optional?selected.length<=required:selected.length===required;
 const toggle=(card:CardDef)=>{if(!matchesSearch(card,request))return;setSelected(current=>current.includes(card.id)?current.filter(id=>id!==card.id):current.length<required?[...current,card.id]:current)};
 return <div className="overlay search-deck-overlay"><section className="search-deck-dialog" role="dialog" aria-modal="true" aria-labelledby="search-title">
  <header><div><span>EFEITO DE PROCURE · SOMENTE VOCÊ VÊ ESTE DECK</span><h2 id="search-title">{request.sourceName}</h2></div><b>{cards.length} cartas no Deck Principal</b></header>
  <div className="search-instruction"><p>Escolha {request.optional?"até ":""}<strong>{required}</strong> {request.filterLabel}. Todas as cópias físicas aparecem separadamente.</p><span>{request.destination==="field"?"Destino: campo":"Destino: sua mão"}{request.reveal?" · ficará revelada ao oponente enquanto estiver na mão":" · informação privada"}</span></div>
  <div className="search-card-grid">{valid.length?valid.map((card,index)=>{const chosen=selectedIds.has(card.id);return <div className={`search-valid ${chosen?"search-selected":""}`} key={`${card.id}-${index}`}><OriginalCard card={card} small inspectable={false} selected={chosen} onClick={()=>toggle(card)}/><b>{card.name}</b><small>Cópia válida {index+1} · custo {card.cost}</small></div>}):<div className="search-empty"><b>Nenhuma carta corresponde</b><span>O Deck Principal não possui uma opção válida para este efeito.</span></div>}</div>
  <footer><span>{selected.length}/{required} selecionada(s)</span>{request.optional&&<button onClick={()=>onConfirm([])}>Não procurar</button>}<button className="confirm-search" disabled={!ready} onClick={()=>onConfirm(selected)}>Confirmar e embaralhar</button></footer>
 </section></div>
}

function MulliganModal({player,count,waiting,pending,deadline,onDecision}:{player:Player;count:number;waiting:boolean;pending:boolean;deadline?:number|null;onDecision:(keep:boolean)=>void}){
 const seconds=useDeadlineSeconds(deadline);
 const nextSize=Math.max(1,player.hand.length-1);
 return <div className="overlay mulligan-overlay"><section className="mulligan-dialog" role="dialog" aria-modal="true"><header><div><p>MÃO INICIAL · {count?`${count} MULLIGAN${count>1?"S":""}`:"7 CARTAS"}</p><h2>{waiting?"Aguardando o oponente":"Manter ou trocar toda a mão?"}</h2></div><span className={seconds<=5?"urgent":""}>⏱ {seconds}s · Nova mão sempre tem 1 carta a menos</span></header>{waiting?<div className="mulligan-wait"><i></i><b>Sua mão foi mantida</b><span>A partida começa assim que o outro jogador terminar.</span></div>:<><p className="mulligan-help">Se pedir mulligan, todas as {player.hand.length} cartas voltam ao Deck Principal, ele é embaralhado e você compra uma mão nova de {nextSize}. É possível repetir até restar 1 carta. Se o tempo acabar, sua mão atual será mantida.</p><div className="mulligan-cards">{player.hand.map((card,index)=><div className="mulligan-card-static" key={`${card.id}-${index}`}><OriginalCard card={card} small inspectable/></div>)}</div><footer><span>{player.hand.length} carta(s) na sua mão inicial</span><div><button disabled={pending||player.hand.length<=1} onClick={()=>onDecision(false)}>{pending?"Confirmando…":`Mulligan → ${nextSize}`}</button><button className="gold" disabled={pending} onClick={()=>onDecision(true)}>{pending?"Confirmando…":`Manter ${player.hand.length}`}</button></div></footer></>}</section></div>
}
